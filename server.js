require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const mysql = require('mysql2/promise');
const os = require('os');
const multer = require('multer');
const sharp = require('sharp');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { createAuthToken, verifyAuthToken } = require('./backend/src/common/auth-token');
const { corsPnaMiddleware } = require('./backend/src/common/cors-pna');
const { createAuthMiddleware, adminOnly } = require('./backend/src/common/auth-middleware');
const { registerAuthUsersRoutes } = require('./backend/src/modules/auth-users/routes');
const { registerDoctorRoutes } = require('./backend/src/modules/doctors/routes');
const { registerTaoRenRoutes } = require('./backend/src/modules/taoren/routes');
const { registerLogRoutes } = require('./backend/src/modules/logs/routes');
const { registerVisitRoutes } = require('./backend/src/modules/visits/routes');
const { registerCluesQueryRoutes } = require('./backend/src/modules/clues-query/routes');
const { registerCluesWriteRoutes } = require('./backend/src/modules/clues-write/routes');
const { registerCluesIoRoutes } = require('./backend/src/modules/clues-io/routes');
const { registerStatsRoutes } = require('./backend/src/modules/stats/routes');

const ENABLE_DEBUG_ROUTES = process.env.ENABLE_DEBUG_ROUTES === '1';

const ACCESS_LOG_FILE = path.join(__dirname, 'access_debug.log');
const ACCESS_LOG_MAX_MB = Number(process.env.ACCESS_LOG_MAX_MB || 10);
const ACCESS_LOG_MAX_BYTES = Number.isFinite(ACCESS_LOG_MAX_MB) && ACCESS_LOG_MAX_MB > 0 ? Math.floor(ACCESS_LOG_MAX_MB * 1024 * 1024) : 10 * 1024 * 1024;
const ACCESS_LOG_SAMPLE_WINDOW_MS = Number(process.env.ACCESS_LOG_SAMPLE_WINDOW_MS || 10000);
const ACCESS_LOG_IGNORE_PATHS = (process.env.ACCESS_LOG_IGNORE_PATHS || '/api/server-version')
  .split(',')
  .map(s => (s || '').trim())
  .filter(Boolean);
const ACCESS_LOG_SAMPLED_PATHS = (process.env.ACCESS_LOG_SAMPLED_PATHS || '/api/server-version')
  .split(',')
  .map(s => (s || '').trim())
  .filter(Boolean);
const _accessLogLastWriteTsByPath = new Map();
const ENABLE_IMPORT_DEBUG_LOG = process.env.ENABLE_IMPORT_DEBUG_LOG === '1';
const IMPORT_DEBUG_FILE = path.join(__dirname, 'import_debug.log');

function shouldIgnoreAccessLog(url){
  return ACCESS_LOG_IGNORE_PATHS.some(p => p && url.includes(p));
}

function shouldSampleSkipAccessLog(url, nowMs){
  const matched = ACCESS_LOG_SAMPLED_PATHS.find(p => p && url.includes(p));
  if(!matched) return false;
  const last = _accessLogLastWriteTsByPath.get(matched) || 0;
  if(nowMs - last < ACCESS_LOG_SAMPLE_WINDOW_MS) return true;
  _accessLogLastWriteTsByPath.set(matched, nowMs);
  return false;
}

function rotateAccessLogIfNeeded(){
  try{
    if(!fs.existsSync(ACCESS_LOG_FILE)) return;
    const st = fs.statSync(ACCESS_LOG_FILE);
    if(!st || st.size < ACCESS_LOG_MAX_BYTES) return;
    const rotated = ACCESS_LOG_FILE + '.1';
    try{ if(fs.existsSync(rotated)) fs.unlinkSync(rotated); }catch(_){ }
    fs.renameSync(ACCESS_LOG_FILE, rotated);
  }catch(_){ }
}

function appendAccessLogAsync(line){
  rotateAccessLogIfNeeded();
  fs.appendFile(ACCESS_LOG_FILE, line + os.EOL, (err) => {
    if(err){
      try{ fs.appendFile(ACCESS_LOG_FILE, 'log_error:' + (err && err.message ? err.message : err) + os.EOL, ()=>{}); }catch(_){ }
    }
  });
}

function appendImportDebugAsync(entry){
  if(!ENABLE_IMPORT_DEBUG_LOG) return;
  const line = typeof entry === 'string' ? entry : JSON.stringify(entry);
  fs.appendFile(IMPORT_DEBUG_FILE, line + os.EOL, () => {});
}

const ALLOWED_CLUE_UPDATE_KEYS = new Set([
  'channel', 'name', 'gender', 'age', 'phone', 'wechat', 'doctor', 'department',
  'regDoctor',
  'intent', 'visitStatus', 'bookUser', 'book', 'arrive', 'medicineDay', 'dosageForm',
  'cost', 'regFee', 'treatmentFee', 'refundAmount', 'refundReason', 'visitMode', 'visitDate', 'createTime', 'content',
  'preCase'
]);

const app = express();
// 开发时强制本地静态资源和首页不走浏览器缓存，避免旧版本继续被复用
app.use((req, res, next) => {
  const cacheBusted = req.path === '/' || req.path === '/index.html' || req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.html');
  if (cacheBusted) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
// 不使用默认 cors()，统一通过下面的自定义中间件处理 CORS 与 Private Network Access（PNA）逻辑
// 增加 body-parser 的大小限制，避免大批量导入时出现 "PayloadTooLargeError: request entity too large"
app.use(express.json({ limit: '10mb' }));
// 同时支持较大的 urlencoded 负载（如果前端使用表形式提交）
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('./'));

app.use(corsPnaMiddleware);

// 诊断中间件：记录到达 /api/* 的请求，方便确认 cloudflared 隧道是否已转发到本地
app.use('/api', (req, res, next) => {
  try{
    const reqUrl = req.originalUrl || req.url || '';
    if(shouldIgnoreAccessLog(reqUrl)) return next();
    if(shouldSampleSkipAccessLog(reqUrl, Date.now())) return next();

    const info = {
      time: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl || req.url,
      origin: req.headers.origin || '',
      host: req.headers.host || '',
      ip: req.ip || (req.connection && req.connection.remoteAddress) || null,
      authPresent: !!req.headers.authorization,
      ua: (req.headers['user-agent'] || '').slice(0,200)
    };
    appendAccessLogAsync(JSON.stringify(info));
  }catch(e){
    try{ appendAccessLogAsync('log_error:' + (e && e.message ? e.message : e)); }catch(_){ }
  }
  next();
});

// 健康检查路由：用于远端验证 ingress 是否正确转发到本地
app.get('/api/_health', (req, res) => {
  res.json({ code:200, data: 'ok' });
});

// 记录服务器启动时间，以便前端能检测到后端重启/部署
const SERVER_STARTED_AT = new Date().toISOString();

// 服务版本/启动时间接口：前端可轮询此接口以检测后端重启
app.get('/api/server-version', (req, res) => {
  // 防止客户端或中间代理缓存该接口，务必返回最新值以便前端能检测到后端重启
  try{
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }catch(e){}
  res.json({ code:200, data: { startedAt: SERVER_STARTED_AT } });
});

// multer for memory storage (images)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Debug log throttles to avoid flooding console when frontend polls frequently
let _lastMedCountsLogTs = 0; // ms timestamp
let _lastTreatUnvisitedLogTs = 0;

// helper: create S3 client for Cloudflare R2 when credentials present
function createS3Client(){
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_DOMAIN } = process.env;
  if(!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;
  const endpoint = process.env.R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return new S3Client({
    region: 'auto',
    endpoint: endpoint,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
}

// 上传图片到 R2 的 API：定义在 authMiddleware 之后（在文件底部插入）

// 临时中间件：记录导入请求的基本信息与前几条数据，便于调试前端导入失败问题
app.use('/api/importClues', express.json({ limit: '20mb' }));
app.use('/api/importClues', (req, res, next) => {
  if(!ENABLE_IMPORT_DEBUG_LOG) return next();
  try {
    const info = {
      time: new Date().toISOString(),
      remote: req.ip || (req.connection && req.connection.remoteAddress) || null,
      hasAuth: !!req.headers.authorization,
      authSample: req.headers.authorization ? (req.headers.authorization + '').slice(0,100) : null,
      contentLength: req.headers['content-length'] || null
    };
    // 如果 body 中包含 clues，记录数量与前 5 条摘要
    if(req.body && Array.isArray(req.body.clues)){
      info.cluesCount = req.body.clues.length;
      info.cluesSample = req.body.clues.slice(0,5).map(c => ({
        phone: c.phone||'',
        wechat: c.wechat||'',
        doctor: c.doctor||'',
        channel: c.channel||'',
        createTime: c.createTime||''
      }));
    }
    appendImportDebugAsync(info);
  } catch (e) {
    appendImportDebugAsync('log_error:' + (e.message||e));
  }
  next();
});

// MySQL config (可用环境变量覆盖)
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'clue_system',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// 为避免 MySQL DATETIME 在驱动层被错误转换为 UTC，明确设置时区并返回日期为字符串
if(!DB_CONFIG.timezone) DB_CONFIG.timezone = process.env.DB_TIMEZONE || '+08:00';
// mysql2 支持 dateStrings 选项，设置为 true 可让 DATETIME/DATE 列以字符串形式返回，避免时区转换
if(typeof DB_CONFIG.dateStrings === 'undefined') DB_CONFIG.dateStrings = true;

let pool;
(async () => {
  try {
    // 先确保数据库存在（如果使用 db-migrate.js 可跳过）
    const tmp = await mysql.createConnection({host: DB_CONFIG.host, user: DB_CONFIG.user, password: DB_CONFIG.password, port: DB_CONFIG.port});
    await tmp.query(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await tmp.end();

    pool = mysql.createPool(DB_CONFIG);
    console.log('MySQL pool created');
    // 启动时不再强制覆盖用户角色；改为读取并记录该用户当前角色（若存在）以便审计/确认
    // 这样可以避免在每次重启时覆盖管理员或人为在前端修改的角色
    try{
      const rows = await query("SELECT username, role FROM users WHERE username = ?", ['盘玲玲']);
      if(rows && rows.length > 0){
        console.log(`User '盘玲玲' exists with role: ${rows[0].role || '(empty)'} (no change applied)`);
      }else{
        console.log("User '盘玲玲' not found (no change applied)");
      }
    }catch(e){ console.warn('check 盘玲玲 role failed', e && e.message ? e.message : e); }
    // 将历史旧值迁移为新到诊/未到诊 文本，避免前端选项不一致
    try{
      await execute("UPDATE clues SET arrive = '已到诊' WHERE arrive = '已到院'");
      await execute("UPDATE clues SET arrive = '未到诊' WHERE arrive = '未到院'");
      console.log('Migrated old arrive values to 到诊 wording');
    }catch(e){ console.warn('arrive migration failed', e && e.message ? e.message : e); }
    // 确保 clues 表包含 bookTime 字段，用于记录预约时间
    try{
      const cols = await query("SHOW COLUMNS FROM clues LIKE 'bookTime'");
      if(!cols || cols.length === 0){
        await execute('ALTER TABLE clues ADD COLUMN bookTime VARCHAR(50) NULL');
        console.log('Added bookTime column to clues');
      }
      await backfillBookedClueTimesFromLogs();
    }catch(e){
      // 如果表不存在或其他错误，忽略（数据库可能刚创建，迁移脚本应负责建表）
      console.warn('ensure bookTime column check failed', e.message || e);
    }
    // 确保 clues 表包含 regDoctor（挂号专家）字段，默认回填为意向专家 doctor
    try{
      const colRegDoctor = await query("SHOW COLUMNS FROM clues LIKE 'regDoctor'");
      if(!colRegDoctor || colRegDoctor.length === 0){
        await execute("ALTER TABLE clues ADD COLUMN regDoctor VARCHAR(100) NULL AFTER doctor");
        console.log('Added regDoctor column to clues');
      }
      await execute("UPDATE clues SET regDoctor = doctor WHERE (regDoctor IS NULL OR regDoctor = '') AND doctor IS NOT NULL AND doctor <> ''");
    }catch(e){
      console.warn('ensure regDoctor column check failed', e.message || e);
    }
    // 确保 clues 表包含 arriveOperatorRole 和 visitCount 字段
    try{
      const colArrive = await query("SHOW COLUMNS FROM clues LIKE 'arriveOperatorRole'");
      if(!colArrive || colArrive.length === 0){
        await execute("ALTER TABLE clues ADD COLUMN arriveOperatorRole VARCHAR(64) NULL");
        console.log('Added arriveOperatorRole column to clues');
      }
    }catch(e){ console.warn('ensure arriveOperatorRole check failed', e.message||e); }
    try{
      const colIntentOp = await query("SHOW COLUMNS FROM clues LIKE 'intentOperator'");
      if(!colIntentOp || colIntentOp.length === 0){
        await execute("ALTER TABLE clues ADD COLUMN intentOperator VARCHAR(128) NULL");
        console.log('Added intentOperator column to clues');
      }
    }catch(e){ console.warn('ensure intentOperator check failed', e.message||e); }
    try{
      // Ensure visitCount exists and is INT. If it's missing or not INT, alter it to INT NULL DEFAULT 0
      const colVisit = await query("SHOW COLUMNS FROM clues LIKE 'visitCount'");
      if(!colVisit || colVisit.length === 0){
        await execute("ALTER TABLE clues ADD COLUMN visitCount INT NULL DEFAULT 0");
        console.log('Added visitCount column (INT) to clues');
      }else{
        // If column exists but not INT, attempt to alter type safely
        const colInfo = colVisit[0];
        const type = (colInfo.Type || '').toLowerCase();
        if(!/int/.test(type)){
          try{
            // Try convert numeric-like values and set non-numeric to 0
            await execute("ALTER TABLE clues MODIFY COLUMN visitCount INT NULL DEFAULT 0");
            console.log('Converted visitCount column to INT');
          }catch(err){ console.warn('Failed to convert visitCount to INT', err && err.message); }
        }
      }
    }catch(e){ console.warn('ensure visitCount check failed', e.message||e); }
    // 确保 clues 表包含 revisitGroupId 字段，用于标记为来自同一复诊组的复制记录
    try{
      const colRevisit = await query("SHOW COLUMNS FROM clues LIKE 'revisitGroupId'");
      if(!colRevisit || colRevisit.length === 0){
        await execute("ALTER TABLE clues ADD COLUMN revisitGroupId VARCHAR(64) NULL");
        console.log('Added revisitGroupId column to clues');
      }
    }catch(e){ console.warn('ensure revisitGroupId check failed', e.message||e); }
    // 确保 clues 表包含 assignedTo 等分配相关字段（向后兼容）
    try{
      const colAssigned = await query("SHOW COLUMNS FROM clues LIKE 'assignedTo'");
      if(!colAssigned || colAssigned.length === 0){
        await execute(`ALTER TABLE clues
          ADD COLUMN assignedTo VARCHAR(100) DEFAULT '' AFTER username,
          ADD COLUMN assignedBy VARCHAR(100) DEFAULT '' AFTER assignedTo,
          ADD COLUMN assignedAt DATETIME NULL AFTER assignedBy,
          ADD COLUMN assignNote TEXT NULL AFTER assignedAt`);
        console.log('Added assignedTo/assignedBy/assignedAt/assignNote columns to clues');
      }
    }catch(e){ console.warn('ensure assignedTo check failed', e.message||e); }
    // 确保 clues 表包含 dosageForm 字段（剂型），用于复诊管理的剂型选择：饮片/代煎/颗粒
    try{
      const colDosage = await query("SHOW COLUMNS FROM clues LIKE 'dosageForm'");
      if(!colDosage || colDosage.length === 0){
        await execute("ALTER TABLE clues ADD COLUMN dosageForm VARCHAR(64) NULL");
        console.log('Added dosageForm column to clues');
      }
    }catch(e){ console.warn('ensure dosageForm check failed', e.message||e); }
    // 确保 clues 表包含 regFee 字段（挂号费），用于在复诊管理中记录挂号费用
    try{
      const colReg = await query("SHOW COLUMNS FROM clues LIKE 'regFee'");
      if(!colReg || colReg.length === 0){
        await execute("ALTER TABLE clues ADD COLUMN regFee DECIMAL(10,2) NULL");
        console.log('Added regFee column to clues');
      }
    }catch(e){ console.warn('ensure regFee check failed', e.message||e); }
    // 确保 clues 表包含 parentClueId 字段，用于标记子线索与母线索关系
    try{
      const colParent = await query("SHOW COLUMNS FROM clues LIKE 'parentClueId'");
      if(!colParent || colParent.length === 0){
        await execute("ALTER TABLE clues ADD COLUMN parentClueId VARCHAR(64) NULL");
        console.log('Added parentClueId column to clues');
      }
    }catch(e){ console.warn('ensure parentClueId check failed', e.message||e); }
    // 确保 clues 表包含 treatmentFee 字段（治疗费），用于在统计中记录治疗费用
    try{
      const colTreat = await query("SHOW COLUMNS FROM clues LIKE 'treatmentFee'");
      if(!colTreat || colTreat.length === 0){
        await execute("ALTER TABLE clues ADD COLUMN treatmentFee DECIMAL(10,2) NULL");
        console.log('Added treatmentFee column to clues');
      }
    }catch(e){ console.warn('ensure treatmentFee check failed', e.message||e); }
    // 确保 clues 表包含退费字段：refundAmount(退费金额)、refundReason(退费原因)
    try{
      const colRefundAmount = await query("SHOW COLUMNS FROM clues LIKE 'refundAmount'");
      if(!colRefundAmount || colRefundAmount.length === 0){
        await execute("ALTER TABLE clues ADD COLUMN refundAmount DECIMAL(10,2) NULL");
        console.log('Added refundAmount column to clues');
      }
      const colRefundReason = await query("SHOW COLUMNS FROM clues LIKE 'refundReason'");
      if(!colRefundReason || colRefundReason.length === 0){
        await execute("ALTER TABLE clues ADD COLUMN refundReason TEXT NULL");
        console.log('Added refundReason column to clues');
      }
    }catch(e){ console.warn('ensure refund fields check failed', e.message||e); }
    // 确保 clues 表包含 preCase 字段（诊前病例收集），用于存储咨询/医助填写的病例备注
    try{
      const colPre = await query("SHOW COLUMNS FROM clues LIKE 'preCase'");
      if(!colPre || colPre.length === 0){
        await execute("ALTER TABLE clues ADD COLUMN preCase TEXT NULL");
        console.log('Added preCase column to clues');
      }
    }catch(e){ console.warn('ensure preCase check failed', e.message||e); }
    // 确保 doctors 表包含 operator 字段（运营人员）
    try{
      const colDocOp = await query("SHOW COLUMNS FROM doctors LIKE 'operator'");
      if(!colDocOp || colDocOp.length === 0){
        await execute("ALTER TABLE doctors ADD COLUMN operator VARCHAR(64) NULL");
        console.log('Added operator column to doctors');
      }
    }catch(e){ console.warn('ensure doctors.operator check failed', e.message||e); }
    // 确保用于记录导入被跳过原因的审计表存在
    try{
      await execute(`CREATE TABLE IF NOT EXISTS import_skips (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(64) NULL,
        wechat VARCHAR(128) NULL,
        reason VARCHAR(128) NULL,
        raw TEXT NULL,
        createTime DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      console.log('Ensured import_skips table exists');
    }catch(e){ console.warn('create import_skips failed', e.message||e); }
    // 确保 clue_images 表存在（用于存储上传图片的元数据）
    try{
      await execute(`CREATE TABLE IF NOT EXISTS clue_images (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        clueId BIGINT NULL,
        url TEXT NOT NULL,
        \`key\` VARCHAR(255) NOT NULL,
        filename VARCHAR(255) NULL,
        uploadedBy VARCHAR(128) NULL,
        uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX(clueId),
        INDEX(\`key\`(191))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      console.log('Ensured clue_images table exists');
    }catch(e){ console.warn('create clue_images failed', e.message||e); }
    // Ensure thumb columns exist so background thumbnail uploads can persist metadata
    try{
      const colThumbSmall = await query("SHOW COLUMNS FROM clue_images LIKE 'thumbSmallKey'");
      if(!colThumbSmall || colThumbSmall.length === 0){
        await execute("ALTER TABLE clue_images ADD COLUMN thumbSmallKey VARCHAR(255) NULL");
        console.log('Added clue_images.thumbSmallKey');
      }
    }catch(e){ console.warn('ensure thumbSmallKey column failed', e.message||e); }
    try{
      const colThumbSmallUrl = await query("SHOW COLUMNS FROM clue_images LIKE 'thumbSmallUrl'");
      if(!colThumbSmallUrl || colThumbSmallUrl.length === 0){
        await execute("ALTER TABLE clue_images ADD COLUMN thumbSmallUrl TEXT NULL");
        console.log('Added clue_images.thumbSmallUrl');
      }
    }catch(e){ console.warn('ensure thumbSmallUrl column failed', e.message||e); }
    // Ensure clue_images.visitId exists to allow associating images to specific visit records
    try{
      const colVisitId = await query("SHOW COLUMNS FROM clue_images LIKE 'visitId'");
      if(!colVisitId || colVisitId.length === 0){
        await execute("ALTER TABLE clue_images ADD COLUMN visitId BIGINT NULL");
        await execute("ALTER TABLE clue_images ADD INDEX (visitId)");
        console.log('Added clue_images.visitId');
      }
    }catch(e){ console.warn('ensure clue_images.visitId check failed', e.message||e); }
  } catch (e) {
    console.error('MySQL init error', e);
    process.exit(1);
  }
})();

// Ensure clues table has expired flag and expiredReason column for storing expired metadata
;(async function ensureCluesExpiredCols(){
  try{
    const colExpired = await query("SHOW COLUMNS FROM clues LIKE 'expired'");
    if(!colExpired || colExpired.length === 0){
      await execute("ALTER TABLE clues ADD COLUMN expired TINYINT(1) DEFAULT 0");
      console.log('Added clues.expired');
    }
    const colReason = await query("SHOW COLUMNS FROM clues LIKE 'expiredReason'");
    if(!colReason || colReason.length === 0){
      await execute("ALTER TABLE clues ADD COLUMN expiredReason TEXT NULL");
      console.log('Added clues.expiredReason');
    }
  }catch(e){ console.warn('ensureCluesExpiredCols failed', e && e.message ? e.message : e); }
})();

function pad(n){ return n<10?('0'+n):(''+n); }
function nowStr(){
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function isPendingBookStatus(book){
  const normalized = (book == null ? '' : String(book)).trim();
  return normalized === '' || normalized === '未预约';
}

function isRestoredFromPublicPool(rec){
  const note = rec && rec.assignNote ? String(rec.assignNote) : '';
  if(!note) return false;
  return note.indexOf('公海再分配') !== -1;
}

function getExpireBaseTime(rec){
  if(!rec) return '';
  if(isRestoredFromPublicPool(rec) && rec.assignedAt) return rec.assignedAt;
  return rec.createTime || '';
}

// 统一的“过期单”判定函数：
// 0. 保护期基准默认从 createTime 起算；若是公海再分配还原单，则从 assignedAt 起算；30 天内统一不算过期；
// 1. 保护期结束后，显式标记 expired=1 视为过期；
// 2. 保护期结束后，意向为“无效”视为过期；
// 3. 否则以“最后一次回访时间”和“还原分配时间”两者较晚者为准，满 15 天且仍未预约则视为过期。
//    若第 15 天又新增回访记录，则从该条最新回访记录时间重新顺延 15 天。
function computeExpired(rec, lastVisitTime){
  try{
    if(!rec) return false;
    const baseTime = getExpireBaseTime(rec);
    const createTs = baseTime ? new Date(baseTime).getTime() : 0;
    const days30 = 30 * 24 * 3600 * 1000;
    if(createTs && !isNaN(createTs) && (createTs + days30 > Date.now())) return false;
    if(Number(rec.expired) === 1 || rec.expired === true) return true;
    if(('' + (rec.intent || '')).toString() === '无效') return true;
    const effectiveLastVisitTime = typeof lastVisitTime !== 'undefined'
      ? lastVisitTime
      : (typeof rec.lastVisitTime !== 'undefined' ? rec.lastVisitTime : rec.lastTime);
    const lastTsRaw = effectiveLastVisitTime ? new Date(effectiveLastVisitTime).getTime() : 0;
    const baseTs = baseTime ? new Date(baseTime).getTime() : 0;
    const lastTs = Math.max(lastTsRaw || 0, baseTs || 0);
    if(!lastTs || isNaN(lastTs)) return false;
    const days15 = 15 * 24 * 3600 * 1000;
    if(lastTs + days15 > Date.now()) return false;
    return isPendingBookStatus(rec.book);
  }catch(e){ console.warn('computeExpired error', e); return false; }
}

async function computeExpiredAsync(rec){
  try{
    if(!rec) return false;

    let fullRec = rec;
    if(rec.id && (typeof rec.intent === 'undefined' || typeof rec.book === 'undefined' || typeof rec.createTime === 'undefined' || typeof rec.assignNote === 'undefined' || typeof rec.assignedAt === 'undefined')){
      const baseRows = await queryClueBaseForExpired(rec.id);
      if(baseRows && baseRows[0]) fullRec = Object.assign({}, baseRows[0], rec);
    }
    if(!fullRec.id) return false;

    const rows = await query('SELECT MAX(time) AS lastTime FROM visits WHERE clueId = ?', [fullRec.id]);
    const lastTime = rows && rows[0] && rows[0].lastTime;
    return computeExpired(fullRec, lastTime);
  }catch(e){ console.warn('computeExpiredAsync error', e); return false; }
}

let hasCluesExpiredColumn = null;
async function queryClueBaseForExpired(id){
  const sqlWithExpired = 'SELECT id, intent, book, expired, createTime, assignNote, assignedAt FROM clues WHERE id = ? LIMIT 1';
  const sqlLegacy = 'SELECT id, intent, book, createTime, assignNote, assignedAt FROM clues WHERE id = ? LIMIT 1';
  if(hasCluesExpiredColumn === false){
    return query(sqlLegacy, [id]);
  }
  try{
    const rows = await query(sqlWithExpired, [id]);
    hasCluesExpiredColumn = true;
    return rows;
  }catch(e){
    const msg = String((e && (e.sqlMessage || e.message)) || '');
    if(e && e.code === 'ER_BAD_FIELD_ERROR' && msg.indexOf("'expired'") !== -1){
      hasCluesExpiredColumn = false;
      console.warn('clues.expired column missing, fallback to legacy clues query');
      return query(sqlLegacy, [id]);
    }
    throw e;
  }
}

// 将 Excel 序列日期（例如 46154.75）或标准字符串日期转为 MySQL DATETIME 字符串 YYYY-MM-DD HH:mm:ss
function excelSerialToDateString(v){
  if(v === null || v === undefined || v === '') return null;
  // 如果已经是合理的字符串（包含 - 或 :），直接返回
  if(typeof v === 'string' && /[-:\s]/.test(v)){
    return v;
  }
  let num = null;
  if(typeof v === 'number') num = v;
  else if(typeof v === 'string' && /^[0-9\.]+$/.test(v)) num = Number(v);
  if(num === null || !Number.isFinite(num)) return null;
  try{
    // Excel 序列：以 1899-12-30 为基点（兼容 1900 年闰年 bug）
    const base = Date.UTC(1899,11,30);
    const ms = Math.round(num * 24 * 60 * 60 * 1000);
    const dt = new Date(base + ms);
    const pad2 = n=>n.toString().padStart(2,'0');
    const Y = dt.getUTCFullYear();
    const M = pad2(dt.getUTCMonth()+1);
    const D = pad2(dt.getUTCDate());
    const h = pad2(dt.getUTCHours());
    const m = pad2(dt.getUTCMinutes());
    const s = pad2(dt.getUTCSeconds());
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
  }catch(e){ return null; }
}

async function query(sql, params){
  const [rows] = await pool.query(sql, params);
  return rows;
}
async function execute(sql, params){
  const [res] = await pool.execute(sql, params);
  return res;
}

const authMiddleware = createAuthMiddleware({ query, verifyAuthToken });

async function addLog(user, text){
  try{ await execute('INSERT INTO logs (`time`, `user`, `text`) VALUES (?,?,?)',[nowStr(), user, text]); }catch(e){console.error('addLog error',e);} 
}


async function backfillBookedClueTimesFromLogs(){
  try{
    const logRows = await query("SELECT time, text FROM logs WHERE text LIKE '%book=已预约%' ORDER BY time ASC");
    const bookTimeById = new Map();
    for(const row of logRows || []){
      const text = String(row && row.text ? row.text : '');
      const match = text.match(/^(?:修改|批量修改)\s+(\d+)\s+book=已预约$/);
      if(match){
        bookTimeById.set(match[1], row.time);
      }
    }

    const clueRows = await query("SELECT id, createTime, bookTime FROM clues WHERE book = '已预约'");
    let updated = 0;
    let fallbackCount = 0;
    for(const clue of clueRows || []){
      if(clue && clue.bookTime && String(clue.bookTime).trim() !== '') continue;
      const rawTime = bookTimeById.get(String(clue.id)) || clue.createTime || nowStr();
      const normalizedTime = String(rawTime).replace(/\//g, '-');
      await execute('UPDATE clues SET bookTime = ? WHERE id = ?', [normalizedTime, clue.id]);
      updated++;
      if(!bookTimeById.has(String(clue.id))) fallbackCount++;
    }

    console.log(`Backfilled bookTime for ${updated} booked clues` + (fallbackCount > 0 ? ` (${fallbackCount} used fallback createTime/now)` : ''));
  }catch(e){
    console.warn('backfillBookedClueTimesFromLogs failed', e && e.message ? e.message : e);
  }
}
// 上传图片到 R2 的 API：接收 multipart/form-data 字段 name=image
app.post('/api/uploadImage', authMiddleware, upload.single('image'), async (req, res) => {
  try{
    if(!req.file) return res.status(400).json({ code:400, msg: '没有上传文件' });
    const file = req.file;
    const originalName = String(file.originalname || 'image').replace(/[\\/\r\n\t]+/g, '_');
    const storageName = originalName;
    const s3 = createS3Client();
    const bucket = process.env.R2_BUCKET_NAME;
    const publicDomain = process.env.R2_PUBLIC_DOMAIN || (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
    if(!s3 || !bucket || !publicDomain) return res.status(500).json({ code:500, msg: 'R2 未配置，无法上传' });
    const baseKey = `clue_images/${Date.now()}_${Math.random().toString(36).slice(2,8)}_${storageName}`;

    // Upload original image first (fast-path). We'll generate and upload a small thumbnail in background to reduce wait time.
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: baseKey, Body: file.buffer, ContentType: file.mimetype }));

    const url = (publicDomain.replace(/\/$/, '') ) + '/' + bucket + '/' + baseKey;

    // persist metadata; if front-end provides a clueId in query param, associate immediately
    const providedClueId = req.query && req.query.clueId ? req.query.clueId : null;
    const providedVisitId = req.query && req.query.visitId ? req.query.visitId : null;
    let insertId = null;
    try{
      // include visitId column (nullable) so uploads can be associated to a visit if provided
      const r = await execute('INSERT INTO clue_images (clueId, visitId, url, `key`, filename, uploadedBy, uploadedAt) VALUES (?, ?, ?, ?, ?, ?, NOW())', [providedClueId, providedVisitId || null, url, baseKey, originalName, req.user.username]);
      insertId = r && r.insertId ? r.insertId : null;
    }catch(e){
      console.warn('save image meta failed', e && e.message);
    }

    // Respond immediately with primary info (original image). Thumbnail will be created asynchronously.
    res.json({ code:200, data: { id: insertId, url, key: baseKey, clueId: providedClueId } });

    // Background task: generate small thumbnail and upload, then persist thumb metadata
    (async () => {
      try{
        const smallThumbBuffer = await sharp(file.buffer).resize({ width: 300, withoutEnlargement: true }).toBuffer();
        const smallThumbKey = `clue_images/thumb_small_${Date.now()}_${Math.random().toString(36).slice(2,8)}_${storageName}`;
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: smallThumbKey, Body: smallThumbBuffer, ContentType: file.mimetype }));
        const thumbSmallUrl = (publicDomain.replace(/\/$/, '') ) + '/' + bucket + '/' + smallThumbKey;
        if(insertId){
          try{
            await execute('UPDATE clue_images SET thumbSmallKey = ?, thumbSmallUrl = ? WHERE id = ?', [smallThumbKey, thumbSmallUrl, insertId]);
          }catch(e){ console.warn('persist thumb meta failed', e && e.message); }
        }
      }catch(bgErr){ console.warn('background thumbnail generation/upload failed', bgErr && bgErr.message); }
    })();

    return;
  }catch(e){ console.error('uploadImage error', e); return res.status(500).json({ code:500, msg: '上传失败' }); }
});

// 获取某条线索的图片列表
app.get('/api/clueImages', authMiddleware, async (req, res) => {
  try{
    // 禁用缓存：确保客户端/代理不会返回 304 导致前端拿不到最新图片元数据
    try{
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }catch(e){ /* ignore header set errors */ }
    const clueId = req.query.clueId;
    if(!clueId) return res.json({ code:200, data: [] });
    const rows = await query('SELECT id, clueId, visitId, url, `key`, filename, uploadedBy, uploadedAt, thumbSmallKey, thumbSmallUrl FROM clue_images WHERE clueId = ? ORDER BY uploadedAt ASC', [clueId]);
    res.json({ code:200, data: rows });
  }catch(e){ console.error('clueImages error', e); res.json({code:500,msg:'查询失败'}); }
});

// 删除单个图片（从 R2 中删除对象并删除数据库记录）
app.post('/api/deleteImage', authMiddleware, async (req, res) => {
  try{
    const body = req.body || {};
    const id = body.id || null;
    if(!id) return res.status(400).json({ code:400, msg: '缺少 image id' });
    // 查询图片元数据
    const rows = await query('SELECT id, `key`, thumbSmallKey FROM clue_images WHERE id = ? LIMIT 1', [id]);
    if(!rows || rows.length === 0) return res.json({ code:404, msg: '图片未找到' });
    const row = rows[0];
    const s3 = createS3Client();
    const bucket = process.env.R2_BUCKET_NAME;
    // 尝试删除主文件与缩略图（若存在），忽略错误继续删除 DB 记录
    try{
      if(s3 && bucket && row['key']){
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: row['key'] }));
      }
      if(s3 && bucket && row['thumbSmallKey']){
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: row['thumbSmallKey'] }));
      }
    }catch(delErr){ console.warn('delete image from r2 failed', delErr && delErr.message); }
    // 删除 DB 记录
    try{
      await execute('DELETE FROM clue_images WHERE id = ?', [id]);
    }catch(dbErr){ console.warn('delete image record failed', dbErr && dbErr.message); }
    await addLog(req.user.username, `删除图片 id=${id}`);
    return res.json({ code:200, msg: '删除成功' });
  }catch(e){ console.error('deleteImage error', e); return res.status(500).json({ code:500, msg: '删除失败' }); }
});

// 图片代理路由：通过本地后端转发 R2 对象，避免客户端直接访问 R2 公共 URL 导致的权限或 CORS 问题
// Accepts query: key=<objectKey>
app.get('/api/image', async (req, res) => {
  try{
    const key = req.query.key;
    if(!key) return res.status(400).send('missing key');
    // basic whitelist: only allow keys under clue_images/
    if(!key.startsWith('clue_images/')) return res.status(403).send('forbidden');

    const s3 = createS3Client();
    const bucket = process.env.R2_BUCKET_NAME;
    if(!s3 || !bucket) return res.status(500).send('R2 not configured');

    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const obj = await s3.send(cmd);
    // obj.Body is a stream in Node.js; pipe to response
    const contentType = obj.ContentType || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    // set caching headers for static assets
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const stream = obj.Body;
    // Pipe stream to response
    stream.pipe(res);
  }catch(e){
    console.error('image proxy error', e && e.code ? e.code : e);
    // If object not found, return 404
    if(e && (e.Code === 'NoSuchKey' || e.$metadata && e.$metadata.httpStatusCode === 404)){
      return res.status(404).send('Not Found');
    }
    return res.status(500).send('error');
  }
});

registerAuthUsersRoutes({
  app,
  query,
  execute,
  addLog,
  createAuthToken,
  authMiddleware,
  adminOnly,
});

registerDoctorRoutes({
  app,
  query,
  execute,
  addLog,
  authMiddleware,
  adminOnly,
});

registerTaoRenRoutes({
  app,
  query,
  execute,
  addLog,
  authMiddleware,
  adminOnly,
});

registerLogRoutes({
  app,
  query,
  authMiddleware,
  adminOnly,
});

registerVisitRoutes({
  app,
  query,
  execute,
  addLog,
  nowStr,
  authMiddleware,
});

registerCluesQueryRoutes({
  app,
  query,
  authMiddleware,
  computeExpired,
});

registerCluesWriteRoutes({
  app,
  query,
  execute,
  addLog,
  nowStr,
  authMiddleware,
  ALLOWED_CLUE_UPDATE_KEYS,
});

registerCluesIoRoutes({
  app,
  query,
  execute,
  addLog,
  nowStr,
  authMiddleware,
  computeExpiredAsync,
  createS3Client,
  DeleteObjectCommand,
  pool,
  getPool: () => pool,
  appendImportDebugAsync,
  excelSerialToDateString,
});

registerStatsRoutes({
  app,
  query,
  nowStr,
  authMiddleware,
  ENABLE_DEBUG_ROUTES,
});

// clues 查询路由已迁移到 backend/src/modules/clues-query/routes.js

// clues 写操作路由已迁移到 backend/src/modules/clues-write/routes.js

// clues I/O 路由已迁移到 backend/src/modules/clues-io/routes.js

// 临时调试路由：显示后端从 Authorization 头解析出的内容（仅用于排查权限问题，调试完成后应移除）
app.get('/api/debug/whoami', authMiddleware, adminOnly, (req, res) => {
  try{
    if(!ENABLE_DEBUG_ROUTES) return res.status(404).json({ code:404, msg: 'Not Found' });
    return res.json({ code:200, data: { username: req.user.username, role: req.user.role } });
  }catch(e){ return res.status(500).json({ code:500, msg: 'whoami error' }); }
});

// 调试路由：返回线索详情、回访记录、相关日志以及后端计算的 fallbackConsultant，便于排查为什么未匹配到咨询人员
app.get('/api/debug/clue/:id', authMiddleware, async (req, res) => {
  try{
    if(!ENABLE_DEBUG_ROUTES) return res.status(404).json({ code:404, msg: 'Not Found' });
    const id = req.params.id;
    if(!id) return res.status(400).json({ code:400, msg: 'missing id' });
    const sql = `SELECT clues.*, 
      (SELECT user FROM visits WHERE clueId = clues.id ORDER BY time ASC LIMIT 1) AS firstVisitUser,
      (SELECT user FROM logs WHERE text LIKE CONCAT('%修改 ', clues.id, ' intent=%') ORDER BY time DESC LIMIT 1) AS intentLogUser,
      (CASE 
        WHEN COALESCE(clues.assignedTo,'')<>'' THEN COALESCE(clues.assignedTo,'')
        WHEN COALESCE(clues.visitStatus,'') LIKE '%访' THEN (SELECT user FROM visits WHERE clueId = clues.id ORDER BY time ASC LIMIT 1)
        WHEN COALESCE(clues.bookUser,'')<>'' THEN COALESCE(clues.bookUser,'')
        WHEN COALESCE(clues.intentOperator,'')<>'' THEN COALESCE(clues.intentOperator,'')
        WHEN (SELECT user FROM logs WHERE text LIKE CONCAT('%修改 ', clues.id, ' intent=%') ORDER BY time DESC LIMIT 1) IS NOT NULL THEN (SELECT user FROM logs WHERE text LIKE CONCAT('%修改 ', clues.id, ' intent=%') ORDER BY time DESC LIMIT 1)
        ELSE NULL END) AS fallbackConsultant
      FROM clues WHERE id = ?`;
    const rows = await query(sql, [id]);
    const clue = rows && rows[0] ? rows[0] : null;
    const visits = await query('SELECT time,user,content FROM visits WHERE clueId = ? ORDER BY time ASC', [id]);
    const logs = await query('SELECT time,user,text FROM logs WHERE text LIKE ? ORDER BY time DESC LIMIT 50', ['%'+id+'%']);
    return res.json({ code:200, data: { clue, visits, logs } });
  }catch(e){ console.error('debug clue error', e); return res.status(500).json({ code:500, msg: 'debug query failed' }); }
});

// 统计路由已迁移到 backend/src/modules/stats/routes.js

// clues 写操作路由已迁移到 backend/src/modules/clues-write/routes.js

// clues I/O 路由已迁移到 backend/src/modules/clues-io/routes.js

// 临时管理接口：列出未关联到任何线索的上传图片（仅管理员/超级管理员可见）
app.get('/api/admin/unassociatedImages', authMiddleware, adminOnly, async (req, res) => {
  try{
    const rows = await query('SELECT id, url, `key`, filename, uploadedBy, uploadedAt, thumbSmallKey, thumbSmallUrl FROM clue_images WHERE clueId IS NULL ORDER BY uploadedAt DESC LIMIT 200');
    res.json({ code:200, data: rows });
  }catch(e){ console.error('unassociatedImages error', e); res.json({ code:500, msg: '查询失败' }); }
});

// 临时管理接口：将一组已上传图片按 key 列表关联到指定线索（仅超级管理员可用）
app.post('/api/admin/associateImages', authMiddleware, async (req, res) => {
  try{
    // 仅允许超级管理员执行此操作
    if(!(req.user && req.user.role === '超级管理员')) return res.status(403).json({ code:403, msg: '仅超级管理员可执行' });
    const { clueId, keys } = req.body || {};
    if(!clueId || !Array.isArray(keys) || keys.length === 0) return res.status(400).json({ code:400, msg: '参数不完整' });
    const placeholders = keys.map(_=>'?').join(',');
    const sql = 'UPDATE clue_images SET clueId = ? WHERE `key` IN (' + placeholders + ')';
    const params = [clueId].concat(keys);
    const result = await execute(sql, params);
    await addLog(req.user.username, `关联图片到线索 ${clueId}，keys=${keys.slice(0,10).join(',')}`);
    res.json({ code:200, data: { affectedRows: result.affectedRows || 0 } });
  }catch(e){ console.error('associateImages error', e); res.json({ code:500, msg: '关联失败' }); }
});

// 将一组已上传图片按 key 列表关联到指定回访 visitId（认证用户可用）
app.post('/api/associateImagesToVisit', authMiddleware, async (req, res) => {
  try{
    const { visitId, keys } = req.body || {};
    if(!visitId || !Array.isArray(keys) || keys.length === 0) return res.status(400).json({ code:400, msg: '参数不完整' });
    // 验证 visit 存在并获取 clueId
    const rows = await query('SELECT id, clueId FROM visits WHERE id = ?', [visitId]);
    if(!rows || rows.length === 0) return res.status(404).json({ code:404, msg: 'visit 未找到' });
    const clueId = rows[0].clueId;
    // 构建占位符并更新 visitId，同时如果 clueId 为空则把 clueId 填充为 visit.clueId
    const placeholders = keys.map(_=>'?').join(',');
    const sql = 'UPDATE clue_images SET visitId = ?, clueId = IFNULL(clueId, ?) WHERE `key` IN (' + placeholders + ')';
    const params = [visitId, clueId].concat(keys);
    const result = await execute(sql, params);
    await addLog(req.user.username, `关联图片到回访 ${visitId}，keys=${keys.slice(0,10).join(',')}`);
    res.json({ code:200, data: { affectedRows: result.affectedRows || 0 } });
  }catch(e){ console.error('associateImagesToVisit error', e); res.json({ code:500, msg: '关联图片到回访失败' }); }
});

// 统计路由已迁移到 backend/src/modules/stats/routes.js

// clues 导入导出路由已迁移到 backend/src/modules/clues-io/routes.js

async function prewarmCachesOnStart() {
  const enabled = process.env.PREWARM_ON_START !== '0';
  if (!enabled) return;
  const startTs = Date.now();
  const warmupQueries = [
    'SELECT COUNT(*) AS c FROM clues',
    "SELECT COUNT(*) AS c FROM clues WHERE book = '已预约'",
    "SELECT COUNT(*) AS c FROM clues WHERE book = '已预约' AND arrive = '已到诊'",
    'SELECT id, username, role FROM users ORDER BY id DESC LIMIT 200',
    'SELECT id, name, dept, operator FROM doctors ORDER BY id DESC LIMIT 200',
    'SELECT id, createTime, visitDate, book, bookUser, doctor, regDoctor, revisitGroupId FROM clues ORDER BY id DESC LIMIT 3000',
    'SELECT id, clueId, time, user FROM visits ORDER BY id DESC LIMIT 3000'
  ];
  let failed = 0;
  for (const sql of warmupQueries) {
    try {
      await query(sql);
    } catch (e) {
      failed += 1;
      console.warn('启动预热单条失败：', e && e.message ? e.message : e);
    }
  }
  const cost = Date.now() - startTs;
  if (failed > 0) {
    console.warn(`启动预热完成（部分失败 ${failed}/${warmupQueries.length}），耗时 ${cost}ms`);
  } else {
    console.log(`启动预热完成，耗时 ${cost}ms`);
  }
}

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
app.listen(PORT, ()=>{
  console.log(`服务已启动： http://localhost:${PORT}`);
  // 后台异步预热，不阻塞服务对外提供能力。
  setTimeout(() => { prewarmCachesOnStart(); }, 500);
});

// 优雅退出：在接收到 SIGINT/SIGTERM 时关闭 MySQL 连接池并退出
process.on('SIGINT', async () => {
  console.log('收到 SIGINT，正在优雅退出...');
  try{ if(pool && typeof pool.end === 'function') await pool.end(); }catch(e){ console.warn('关闭 pool 错误', e); }
  process.exit(0);
});
process.on('SIGTERM', async () => {
  console.log('收到 SIGTERM，正在优雅退出...');
  try{ if(pool && typeof pool.end === 'function') await pool.end(); }catch(e){ console.warn('关闭 pool 错误', e); }
  process.exit(0);
});
