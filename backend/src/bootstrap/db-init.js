async function runStartupDbMigrations(ctx) {
  const query = ctx.query;
  const execute = ctx.execute;
  const backfillBookedClueTimesFromLogs = ctx.backfillBookedClueTimesFromLogs;

  // 启动时不再强制覆盖用户角色；改为读取并记录该用户当前角色（若存在）以便审计/确认
  // 这样可以避免在每次重启时覆盖管理员或人为在前端修改的角色
  try {
    const rows = await query("SELECT username, role FROM users WHERE username = ?", ['盘玲玲']);
    if (rows && rows.length > 0) {
      console.log(`User '盘玲玲' exists with role: ${rows[0].role || '(empty)'} (no change applied)`);
    } else {
      console.log("User '盘玲玲' not found (no change applied)");
    }
  } catch (e) { console.warn('check 盘玲玲 role failed', e && e.message ? e.message : e); }

  // 将历史旧值迁移为新到诊/未到诊 文本，避免前端选项不一致
  try {
    await execute("UPDATE clues SET arrive = '已到诊' WHERE arrive = '已到院'");
    await execute("UPDATE clues SET arrive = '未到诊' WHERE arrive = '未到院'");
    console.log('Migrated old arrive values to 到诊 wording');
  } catch (e) { console.warn('arrive migration failed', e && e.message ? e.message : e); }

  // 确保 clues 表包含 bookTime 字段，用于记录预约时间
  try {
    const cols = await query("SHOW COLUMNS FROM clues LIKE 'bookTime'");
    if (!cols || cols.length === 0) {
      await execute('ALTER TABLE clues ADD COLUMN bookTime VARCHAR(50) NULL');
      console.log('Added bookTime column to clues');
    }
    await backfillBookedClueTimesFromLogs();
  } catch (e) {
    // 如果表不存在或其他错误，忽略（数据库可能刚创建，迁移脚本应负责建表）
    console.warn('ensure bookTime column check failed', e.message || e);
  }

  // 确保 clues 表包含 regDoctor（挂号专家）字段，默认回填为意向专家 doctor
  try {
    const colRegDoctor = await query("SHOW COLUMNS FROM clues LIKE 'regDoctor'");
    if (!colRegDoctor || colRegDoctor.length === 0) {
      await execute("ALTER TABLE clues ADD COLUMN regDoctor VARCHAR(100) NULL AFTER doctor");
      console.log('Added regDoctor column to clues');
    }
    await execute("UPDATE clues SET regDoctor = doctor WHERE (regDoctor IS NULL OR regDoctor = '') AND doctor IS NOT NULL AND doctor <> ''");
  } catch (e) {
    console.warn('ensure regDoctor column check failed', e.message || e);
  }

  // 确保 clues 表包含 arriveOperatorRole 和 visitCount 字段
  try {
    const colArrive = await query("SHOW COLUMNS FROM clues LIKE 'arriveOperatorRole'");
    if (!colArrive || colArrive.length === 0) {
      await execute("ALTER TABLE clues ADD COLUMN arriveOperatorRole VARCHAR(64) NULL");
      console.log('Added arriveOperatorRole column to clues');
    }
  } catch (e) { console.warn('ensure arriveOperatorRole check failed', e.message || e); }
  try {
    const colIntentOp = await query("SHOW COLUMNS FROM clues LIKE 'intentOperator'");
    if (!colIntentOp || colIntentOp.length === 0) {
      await execute("ALTER TABLE clues ADD COLUMN intentOperator VARCHAR(128) NULL");
      console.log('Added intentOperator column to clues');
    }
  } catch (e) { console.warn('ensure intentOperator check failed', e.message || e); }
  try {
    // Ensure visitCount exists and is INT. If it's missing or not INT, alter it to INT NULL DEFAULT 0
    const colVisit = await query("SHOW COLUMNS FROM clues LIKE 'visitCount'");
    if (!colVisit || colVisit.length === 0) {
      await execute("ALTER TABLE clues ADD COLUMN visitCount INT NULL DEFAULT 0");
      console.log('Added visitCount column (INT) to clues');
    } else {
      // If column exists but not INT, attempt to alter type safely
      const colInfo = colVisit[0];
      const type = (colInfo.Type || '').toLowerCase();
      if (!/int/.test(type)) {
        try {
          // Try convert numeric-like values and set non-numeric to 0
          await execute("ALTER TABLE clues MODIFY COLUMN visitCount INT NULL DEFAULT 0");
          console.log('Converted visitCount column to INT');
        } catch (err) { console.warn('Failed to convert visitCount to INT', err && err.message); }
      }
    }
  } catch (e) { console.warn('ensure visitCount check failed', e.message || e); }

  // 确保 clues 表包含 revisitGroupId 字段，用于标记为来自同一复诊组的复制记录
  try {
    const colRevisit = await query("SHOW COLUMNS FROM clues LIKE 'revisitGroupId'");
    if (!colRevisit || colRevisit.length === 0) {
      await execute("ALTER TABLE clues ADD COLUMN revisitGroupId VARCHAR(64) NULL");
      console.log('Added revisitGroupId column to clues');
    }
  } catch (e) { console.warn('ensure revisitGroupId check failed', e.message || e); }

  // 确保 clues 表包含 assignedTo 等分配相关字段（向后兼容）
  try {
    const colAssigned = await query("SHOW COLUMNS FROM clues LIKE 'assignedTo'");
    if (!colAssigned || colAssigned.length === 0) {
      await execute(`ALTER TABLE clues
          ADD COLUMN assignedTo VARCHAR(100) DEFAULT '' AFTER username,
          ADD COLUMN assignedBy VARCHAR(100) DEFAULT '' AFTER assignedTo,
          ADD COLUMN assignedAt DATETIME NULL AFTER assignedBy,
          ADD COLUMN assignNote TEXT NULL AFTER assignedAt`);
      console.log('Added assignedTo/assignedBy/assignedAt/assignNote columns to clues');
    }
  } catch (e) { console.warn('ensure assignedTo check failed', e.message || e); }

  // 确保 clues 表包含 dosageForm 字段（剂型），用于复诊管理的剂型选择：饮片/代煎/颗粒
  try {
    const colDosage = await query("SHOW COLUMNS FROM clues LIKE 'dosageForm'");
    if (!colDosage || colDosage.length === 0) {
      await execute("ALTER TABLE clues ADD COLUMN dosageForm VARCHAR(64) NULL");
      console.log('Added dosageForm column to clues');
    }
  } catch (e) { console.warn('ensure dosageForm check failed', e.message || e); }

  // 确保 clues 表包含 regFee 字段（挂号费），用于在复诊管理中记录挂号费用
  try {
    const colReg = await query("SHOW COLUMNS FROM clues LIKE 'regFee'");
    if (!colReg || colReg.length === 0) {
      await execute("ALTER TABLE clues ADD COLUMN regFee DECIMAL(10,2) NULL");
      console.log('Added regFee column to clues');
    }
  } catch (e) { console.warn('ensure regFee check failed', e.message || e); }

  // 确保 clues 表包含 parentClueId 字段，用于标记子线索与母线索关系
  try {
    const colParent = await query("SHOW COLUMNS FROM clues LIKE 'parentClueId'");
    if (!colParent || colParent.length === 0) {
      await execute("ALTER TABLE clues ADD COLUMN parentClueId VARCHAR(64) NULL");
      console.log('Added parentClueId column to clues');
    }
  } catch (e) { console.warn('ensure parentClueId check failed', e.message || e); }

  // 确保 clues 表包含 treatmentFee 字段（治疗费），用于在统计中记录治疗费用
  try {
    const colTreat = await query("SHOW COLUMNS FROM clues LIKE 'treatmentFee'");
    if (!colTreat || colTreat.length === 0) {
      await execute("ALTER TABLE clues ADD COLUMN treatmentFee DECIMAL(10,2) NULL");
      console.log('Added treatmentFee column to clues');
    }
  } catch (e) { console.warn('ensure treatmentFee check failed', e.message || e); }

  // 确保 clues 表包含退费字段：refundAmount(退费金额)、refundReason(退费原因)
  try {
    const colRefundAmount = await query("SHOW COLUMNS FROM clues LIKE 'refundAmount'");
    if (!colRefundAmount || colRefundAmount.length === 0) {
      await execute("ALTER TABLE clues ADD COLUMN refundAmount DECIMAL(10,2) NULL");
      console.log('Added refundAmount column to clues');
    }
    const colRefundReason = await query("SHOW COLUMNS FROM clues LIKE 'refundReason'");
    if (!colRefundReason || colRefundReason.length === 0) {
      await execute("ALTER TABLE clues ADD COLUMN refundReason TEXT NULL");
      console.log('Added refundReason column to clues');
    }
  } catch (e) { console.warn('ensure refund fields check failed', e.message || e); }

  // 确保 clues 表包含 preCase 字段（诊前病例收集），用于存储咨询/医助填写的病例备注
  try {
    const colPre = await query("SHOW COLUMNS FROM clues LIKE 'preCase'");
    if (!colPre || colPre.length === 0) {
      await execute("ALTER TABLE clues ADD COLUMN preCase TEXT NULL");
      console.log('Added preCase column to clues');
    }
  } catch (e) { console.warn('ensure preCase check failed', e.message || e); }

  // 确保 doctors 表包含 operator 字段（运营人员）
  try {
    const colDocOp = await query("SHOW COLUMNS FROM doctors LIKE 'operator'");
    if (!colDocOp || colDocOp.length === 0) {
      await execute("ALTER TABLE doctors ADD COLUMN operator VARCHAR(64) NULL");
      console.log('Added operator column to doctors');
    }
  } catch (e) { console.warn('ensure doctors.operator check failed', e.message || e); }

  // 确保用于记录导入被跳过原因的审计表存在
  try {
    await execute(`CREATE TABLE IF NOT EXISTS import_skips (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(64) NULL,
        wechat VARCHAR(128) NULL,
        reason VARCHAR(128) NULL,
        raw TEXT NULL,
        createTime DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('Ensured import_skips table exists');
  } catch (e) { console.warn('create import_skips failed', e.message || e); }

  // 确保 clue_images 表存在（用于存储上传图片的元数据）
  try {
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
  } catch (e) { console.warn('create clue_images failed', e.message || e); }

  // Ensure thumb columns exist so background thumbnail uploads can persist metadata
  try {
    const colThumbSmall = await query("SHOW COLUMNS FROM clue_images LIKE 'thumbSmallKey'");
    if (!colThumbSmall || colThumbSmall.length === 0) {
      await execute("ALTER TABLE clue_images ADD COLUMN thumbSmallKey VARCHAR(255) NULL");
      console.log('Added clue_images.thumbSmallKey');
    }
  } catch (e) { console.warn('ensure thumbSmallKey column failed', e.message || e); }
  try {
    const colThumbSmallUrl = await query("SHOW COLUMNS FROM clue_images LIKE 'thumbSmallUrl'");
    if (!colThumbSmallUrl || colThumbSmallUrl.length === 0) {
      await execute("ALTER TABLE clue_images ADD COLUMN thumbSmallUrl TEXT NULL");
      console.log('Added clue_images.thumbSmallUrl');
    }
  } catch (e) { console.warn('ensure thumbSmallUrl column failed', e.message || e); }

  // Ensure clue_images.visitId exists to allow associating images to specific visit records
  try {
    const colVisitId = await query("SHOW COLUMNS FROM clue_images LIKE 'visitId'");
    if (!colVisitId || colVisitId.length === 0) {
      await execute("ALTER TABLE clue_images ADD COLUMN visitId BIGINT NULL");
      await execute("ALTER TABLE clue_images ADD INDEX (visitId)");
      console.log('Added clue_images.visitId');
    }
  } catch (e) { console.warn('ensure clue_images.visitId check failed', e.message || e); }
}

async function ensureCluesExpiredCols(ctx) {
  const query = ctx.query;
  const execute = ctx.execute;

  try {
    const colExpired = await query("SHOW COLUMNS FROM clues LIKE 'expired'");
    if (!colExpired || colExpired.length === 0) {
      await execute("ALTER TABLE clues ADD COLUMN expired TINYINT(1) DEFAULT 0");
      console.log('Added clues.expired');
    }
    const colReason = await query("SHOW COLUMNS FROM clues LIKE 'expiredReason'");
    if (!colReason || colReason.length === 0) {
      await execute("ALTER TABLE clues ADD COLUMN expiredReason TEXT NULL");
      console.log('Added clues.expiredReason');
    }
  } catch (e) { console.warn('ensureCluesExpiredCols failed', e && e.message ? e.message : e); }
}

module.exports = {
  runStartupDbMigrations,
  ensureCluesExpiredCols,
};
