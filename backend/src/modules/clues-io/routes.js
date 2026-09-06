const XLSX = require('xlsx');

function registerCluesIoRoutes(deps) {
  const app = deps.app;
  const query = deps.query;
  const execute = deps.execute;
  const addLog = deps.addLog;
  const nowStr = deps.nowStr;
  const authMiddleware = deps.authMiddleware;

  function buildConsultAssigneeExpr(clueAlias) {
    const c = clueAlias || 'clues';
    return `COALESCE(
      NULLIF(${c}.assignedTo, ''),
      NULLIF((CASE WHEN COALESCE(${c}.visitStatus, '') REGEXP '访' THEN (SELECT user FROM visits WHERE clueId = ${c}.id ORDER BY time ASC LIMIT 1) ELSE '' END), ''),
      NULLIF(${c}.bookUser, ''),
      NULLIF(${c}.intentOperator, ''),
      ''
    )`;
  }
  const computeExpiredAsync = deps.computeExpiredAsync;
  const createS3Client = deps.createS3Client;
  const DeleteObjectCommand = deps.DeleteObjectCommand;
  const appendImportDebugAsync = deps.appendImportDebugAsync;
  const excelSerialToDateString = deps.excelSerialToDateString;

  function getPool() {
    if (typeof deps.getPool === 'function') return deps.getPool();
    return deps.pool;
  }

  function ensurePoolReady(res) {
    const pool = getPool();
    if (!pool || typeof pool.getConnection !== 'function') {
      if (res) {
        res.status(500).json({ code: 500, msg: '数据库连接池未初始化，请重启服务后重试导入' });
      }
      return null;
    }
    return pool;
  }

  async function resolveIntroRootParentClueId(data, fallbackParentClueId) {
    const payload = data || {};
    const channel = (payload.channel || '').toString().trim();
    const phone = (payload.phone || '').toString().trim();
    if (channel !== '介绍' || !phone) return fallbackParentClueId;
    try {
      const rows = await query(
        'SELECT id FROM clues WHERE phone = ? AND phone <> "" ORDER BY createTime ASC, id ASC LIMIT 1',
        [phone]
      );
      if (rows && rows[0] && rows[0].id) return String(rows[0].id);
    } catch (e) {
      console.warn('resolve intro root parent failed', e && e.message ? e.message : e);
    }
    return fallbackParentClueId;
  }

  async function findDuplicateCandidates(data, requestedParentClueId) {
    const payload = data || {};
    const nameTrim = (payload.name || '').toString().trim();
    const phoneTrim = (payload.phone || '').toString().trim();
    const wechatTrim = (payload.wechat || '').toString().trim();
    if (!(nameTrim || phoneTrim || wechatTrim) || requestedParentClueId) return [];
    const rows = await query(
      'SELECT id, createTime, doctor, taoRen, name, phone, wechat, intent, book FROM clues WHERE (phone = ? AND phone <> "") OR (wechat = ? AND wechat <> "") OR (name = ? AND name <> "") ORDER BY createTime DESC, id DESC',
      [phoneTrim, wechatTrim, nameTrim]
    );
    const list = Array.isArray(rows) ? rows.slice() : [];
    for (const row of list) {
      row.expired = await computeExpiredAsync(row);
    }
    return list;
  }

  function getCreateRequiredErrors(data) {
    const payload = data || {};
    const channel = (payload.channel || '').toString().trim();
    const doctor = (payload.doctor || '').toString().trim();
    const phone = (payload.phone || '').toString().trim();
    const wechat = (payload.wechat || '').toString().trim();
    const content = (payload.content || '').toString().trim();
    const errors = [];
    if (!channel) errors.push('渠道');
    if (!doctor) errors.push('意向专家');
    if (!phone && !wechat) errors.push('电话或微信（至少填一项）');
    if (!content) errors.push('咨询备注');
    return errors;
  }

  function normalizeChannelName(v) {
    const s = (v || '').toString().trim();
    if (s === '自助挂号') return '自主挂号';
    return s;
  }

  function canImportByRole(role) {
    return role === '主管' || role === '超级管理员' || role === '咨询' || role === '套电' || role === '医助';
  }

  async function collectImportConflicts(conn, clues) {
    const conflicts = [];
    for (let i = 0; i < clues.length; i++) {
      const clue = clues[i] || {};
      const phone = (clue.phone || '').toString().trim();
      const wechat = (clue.wechat || '').toString().trim();
      if (!phone && !wechat) continue;
      let existing = null;
      if (phone) {
        const r = await conn.execute('SELECT * FROM clues WHERE phone = ? LIMIT 1', [phone]);
        if (r && r[0] && r[0].length > 0) existing = r[0][0];
      }
      if (!existing && wechat) {
        const r2 = await conn.execute('SELECT * FROM clues WHERE wechat = ? LIMIT 1', [wechat]);
        if (r2 && r2[0] && r2[0].length > 0) existing = r2[0][0];
      }
      if (!existing) continue;
      const keys = ['taoRen', 'channel', 'name', 'gender', 'age', 'doctor', 'regDoctor', 'department', 'intent', 'visitStatus', 'bookUser', 'book', 'arrive', 'medicineDay', 'cost', 'visitMode', 'visitDate', 'phone', 'wechat', 'content', 'firstConsultTime', 'bookTime', 'username'];
      const changes = {};
      for (const k of keys) {
        const inVal = clue[k] !== undefined && clue[k] !== null ? ('' + clue[k]).trim() : '';
        const exVal = existing[k] !== undefined && existing[k] !== null ? ('' + existing[k]).trim() : '';
        if (inVal !== '' && inVal !== exVal) {
          changes[k] = { from: exVal, to: inVal };
        }
      }
      if (Object.keys(changes).length > 0) {
        conflicts.push({ rowIndex: i, existingId: existing.id, existing: existing, incoming: clue, changes: changes });
      }
    }
    return conflicts;
  }

  app.post('/api/save', authMiddleware, async (req, res) => {
    try {
      const id = Date.now();
      const data = req.body || {};
      const requiredErrors = getCreateRequiredErrors(data);
      if (requiredErrors.length > 0) {
        return res.status(400).json({ code: 400, msg: '请填写：' + requiredErrors.join('、') });
      }
      const createTime = nowStr();
      let markDupToExpire = null;
      let markDupReason = '';
      const requestedParentClueId =
        data.parentClueId && String(data.parentClueId).trim() !== '' ? String(data.parentClueId).trim() : null;
      let linkParentClueId = requestedParentClueId;
      try {
        const dupRows = await findDuplicateCandidates(data, requestedParentClueId);
        if (dupRows.length > 0) {
          const activeDup = dupRows.find((dup) => !dup.expired);
          if (activeDup) {
            return res.status(409).json({ code: 409, msg: 'duplicate', existing: Object.assign({}, activeDup, { expired: false }) });
          }

          const dup = dupRows[0];
          if (data && data.forceInsert) {
            const dupDoctor = (dup.doctor || '').toString();
            const reqDoctor = (data.doctor || '').toString();
            if (dupDoctor && reqDoctor && dupDoctor === reqDoctor) {
              return res.status(409).json({ code: 409, msg: 'duplicate_same_doctor', existing: Object.assign({}, dup, { expired: true }) });
            }
            markDupToExpire = dup.id;
            markDupReason = '';
          } else {
            return res.status(409).json({ code: 409, msg: 'duplicate', existing: Object.assign({}, dup, { expired: true }) });
          }
        }
      } catch (e) {
        console.warn('duplicate check failed', e && e.message ? e.message : e);
      }
      linkParentClueId = await resolveIntroRootParentClueId(data, linkParentClueId);
      const sql = 'INSERT INTO clues (id, taoRen, channel, name, gender, age, phone, wechat, doctor, regDoctor, department, preCase, content, intent, visitStatus, bookUser, book, arrive, medicineDay, cost, visitMode, visitDate, createTime, firstConsultTime, username, parentClueId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
      const tao3 = req.user && req.user.username ? req.user.username : data.taoRen || '';
      const params = [
        id,
        tao3,
        data.channel || '',
        data.name || '',
        data.gender || '',
        data.age || null,
        data.phone || '',
        data.wechat || '',
        data.doctor || '',
        data.regDoctor || data.doctor || '',
        data.department || '',
        data.preCase || '',
        data.content || '',
        '',
        '',
        data.bookUser || '',
        data.book || '',
        '未到诊',
        data.medicineDay || '',
        data.cost || '',
        data.visitMode || '',
        data.visitDate || '',
        createTime,
        null,
        req.user.username,
        linkParentClueId,
      ];
      await execute(sql, params);
      try {
        if (markDupToExpire) {
          const rr = await query('SELECT intent, book FROM clues WHERE id = ?', [markDupToExpire]);
          const info = rr && rr[0] ? rr[0] : null;
          let reason = '';
          if (info) {
            if (('' + (info.intent || '')).toString() === '无效') {
              reason = '意向为 无效';
            } else {
              const vt = await query('SELECT MAX(time) AS lastTime FROM visits WHERE clueId = ?', [markDupToExpire]);
              const lastTime = vt && vt[0] && vt[0].lastTime;
              if (lastTime) {
                reason = `最后回访时间：${lastTime}，超过 15 天且未预约`;
              } else {
                reason = '系统判定为过期单';
              }
              const book = (info.book || '').toString();
              if (book && book !== '' && book !== '未预约') {
                reason = reason + `（当前预约状态：${book}）`;
              }
            }
          }
          await execute('UPDATE clues SET visitStatus = ?, expired = 1, expiredReason = ? WHERE id = ?', ['过期单', reason, markDupToExpire]);
          await addLog(req.user.username, `标记过期单：${markDupToExpire} 原因：${reason}`);
        }
      } catch (e) {
        console.warn('mark dup expired failed', e);
      }
      try {
        if (Array.isArray(data.images) && data.images.length > 0) {
          const placeholders = data.images.map(() => '?').join(',');
          const upSql = 'UPDATE clue_images SET clueId = ? WHERE `key` IN (' + placeholders + ')';
          await execute(upSql, [id].concat(data.images));
        }
      } catch (e) {
        console.warn('associate images failed', e && e.message);
      }
      await addLog(req.user.username, `新增线索 ${id}：${data.name || ''}，医生：${data.doctor || ''}`);
      return res.json({ code: 200, data: { id: id } });
    } catch (e) {
      console.error('save error', e);
      return res.json({ code: 500, msg: '添加失败' });
    }
  });

  app.post('/api/addClue', authMiddleware, async (req, res) => {
    try {
      const id = Date.now();
      const data = req.body || {};
      const requiredErrors = getCreateRequiredErrors(data);
      if (requiredErrors.length > 0) {
        return res.status(400).json({ code: 400, msg: '请填写：' + requiredErrors.join('、') });
      }
      const createTime = nowStr();
      let markDupToExpire = null;
      let markDupReason = '';
      const requestedParentClueId =
        data.parentClueId && String(data.parentClueId).trim() !== '' ? String(data.parentClueId).trim() : null;
      let linkParentClueId = requestedParentClueId;
      try {
        const dupRows = await findDuplicateCandidates(data, requestedParentClueId);
        if (dupRows.length > 0) {
          const activeDup = dupRows.find((dup) => !dup.expired);
          if (activeDup) {
            return res.status(409).json({ code: 409, msg: 'duplicate', existing: Object.assign({}, activeDup, { expired: false }) });
          }

          const dup = dupRows[0];
          if (data && data.forceInsert) {
            const dupDoctor = (dup.doctor || '').toString();
            const reqDoctor = (data.doctor || '').toString();
            if (dupDoctor && reqDoctor && dupDoctor === reqDoctor) {
              return res.status(409).json({ code: 409, msg: 'duplicate_same_doctor', existing: Object.assign({}, dup, { expired: true }) });
            }
            markDupToExpire = dup.id;
            markDupReason = '';
          } else {
            return res.status(409).json({ code: 409, msg: 'duplicate', existing: Object.assign({}, dup, { expired: true }) });
          }
        }
      } catch (e) {
        console.warn('duplicate check failed', e && e.message ? e.message : e);
      }
      linkParentClueId = await resolveIntroRootParentClueId(data, linkParentClueId);
      const sql = 'INSERT INTO clues (id, taoRen, channel, name, gender, age, phone, wechat, doctor, regDoctor, department, preCase, content, intent, visitStatus, bookUser, book, arrive, medicineDay, cost, visitMode, visitDate, createTime, firstConsultTime, username, parentClueId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
      const tao2 = req.user && req.user.username ? req.user.username : data.taoRen || '';
      const params = [
        id,
        tao2,
        data.channel || '',
        data.name || '',
        data.gender || '',
        data.age || null,
        data.phone || '',
        data.wechat || '',
        data.doctor || '',
        data.regDoctor || data.doctor || '',
        data.department || '',
        data.preCase || '',
        data.content || '',
        '',
        '',
        data.bookUser || '',
        data.book || '',
        '未到诊',
        data.medicineDay || '',
        data.cost || '',
        data.visitMode || '',
        data.visitDate || '',
        createTime,
        null,
        req.user.username,
        linkParentClueId,
      ];
      await execute(sql, params);
      try {
        if (Array.isArray(data.images) && data.images.length > 0) {
          const placeholders = data.images.map(() => '?').join(',');
          const upSql = 'UPDATE clue_images SET clueId = ? WHERE `key` IN (' + placeholders + ')';
          await execute(upSql, [id].concat(data.images));
        }
      } catch (e) {
        console.warn('associate images failed', e && e.message);
      }
      await addLog(req.user.username, `新增线索 ${id}：${data.name || ''}，医生：${data.doctor || ''}`);
      return res.json({ code: 200, data: { id: id } });
    } catch (e) {
      console.error('addClue error', e);
      return res.json({ code: 500, msg: '添加失败' });
    }
  });

  app.get('/api/exportByVisitDate', authMiddleware, async (req, res) => {
    try {
      const date = req.query.date;
      if (!date) return res.status(400).json({ code: 400, msg: 'date 参数缺失，格式 YYYY-MM-DD' });
      const role = req.user && req.user.role;
      if (!(role === '主管' || role === '超级管理员' || role === '咨询' || role === '套电' || role === '医助')) {
        return res.status(403).json({ code: 403, msg: '无权限导出' });
      }
      const sql = 'SELECT name, gender, age, phone, visitMode, visitDate as visitTime FROM clues WHERE (visitDate IS NOT NULL AND visitDate <> "" AND DATE(visitDate) = ?) ORDER BY visitTime ASC';
      const rows = await query(sql, [date]);
      const sheetData = [];
      sheetData.push(['姓名', '性别', '年龄', '电话', '就诊方式', '到诊时间']);
      for (const r of rows) {
        sheetData.push([r.name || '', r.gender || '', r.age || '', r.phone || '', r.visitMode || '', r.visitTime || '']);
      }
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, ws, '到诊线索');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="到诊线索_${date}.xlsx"`);
      return res.send(buffer);
    } catch (e) {
      console.error('exportByVisitDate error', e);
      return res.status(500).json({ code: 500, msg: '导出失败' });
    }
  });

  app.post('/api/del', authMiddleware, async (req, res) => {
    try {
      if (req.user.role !== '超级管理员') return res.status(403).json({ code: 403, msg: '无权限删除' });
      const { id } = req.body;
      if (!id) return res.json({ code: 400, msg: 'id 为空' });
      try {
        const imgs = await query('SELECT `key`, thumbSmallKey FROM clue_images WHERE clueId = ?', [id]);
        if (imgs && imgs.length > 0) {
          const s3 = createS3Client();
          const bucket = process.env.R2_BUCKET_NAME;
          if (s3 && bucket) {
            for (const r of imgs) {
              const k = r && (r.key || r['key']);
              const tk = r && (r.thumbSmallKey || r['thumbSmallKey']);
              if (k) {
                try {
                  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: k }));
                } catch (e) {
                  console.warn('delete r2 object failed', k, e && e.message);
                }
              }
              if (tk) {
                try {
                  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: tk }));
                } catch (e) {
                  console.warn('delete r2 thumb failed', tk, e && e.message);
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('collect/delete associated images failed', e && e.message);
      }

      try {
        await execute('DELETE FROM clue_images WHERE clueId = ?', [id]);
      } catch (e) {
        console.warn('delete clue_images meta failed', e && e.message);
      }

      let delName = '';
      let delDoctor = '';
      try {
        const delRows = await query('SELECT name, doctor FROM clues WHERE id = ? LIMIT 1', [id]);
        if (delRows && delRows[0]) { delName = delRows[0].name || ''; delDoctor = delRows[0].doctor || ''; }
      } catch (e) { console.warn('query clue before delete failed', e && e.message); }
      await execute('DELETE FROM clues WHERE id = ?', [id]);
      await addLog(req.user.username, `删除线索 ${id}：${delName}，医生：${delDoctor}`);
      return res.json({ code: 200 });
    } catch (e) {
      console.error('del error', e);
      return res.json({ code: 500, msg: '删除失败' });
    }
  });

  app.post('/api/importClues', authMiddleware, async (req, res) => {
    try {
      const activePool = ensurePoolReady(res);
      if (!activePool) return;
      if (!canImportByRole(req.user && req.user.role)) return res.status(403).json({ code: 403, msg: '无权限导入' });
      const { clues, confirm } = req.body;
      if (!Array.isArray(clues)) return res.json({ code: 400, msg: '数据格式错误' });
      let imported = 0;
      let skipped = 0;
      const errors = [];
      const pendingConflicts = [];
      const allowForceInsert = confirm === true || confirm === 'true' || confirm === 1 || confirm === '1';
      const conn = await activePool.getConnection();
      try {
        const allConflicts = await collectImportConflicts(conn, clues);
        const conflictByRowIndex = new Map();
        for (const c of allConflicts) {
          if (c && typeof c.rowIndex === 'number') conflictByRowIndex.set(c.rowIndex, c);
        }
        for (let i = 0; i < clues.length; i++) {
          const clue = clues[i] || {};
          const rowNo = i + 1;
          const reqErrs = getCreateRequiredErrors(clue);
          if (reqErrs.length > 0) {
            skipped++;
            errors.push({ row: rowNo, phone: (clue.phone || '').toString().trim(), wechat: (clue.wechat || '').toString().trim(), reason: 'required_fields_missing', message: '缺少必填项：' + reqErrs.join('、') });
            try {
              await conn.execute('INSERT INTO import_skips (phone,wechat,reason,raw) VALUES (?,?,?,?)', [
                (clue.phone || '').toString().trim() || null,
                (clue.wechat || '').toString().trim() || null,
                'required_fields_missing',
                JSON.stringify(clue || {}),
              ]);
            } catch (_) {}
            continue;
          }
          const rawCreate = clue.createTime !== undefined && clue.createTime !== null ? clue.createTime : '';
          let createTime = nowStr();
          if (rawCreate !== '' && rawCreate !== null) {
            const parsedCreate = excelSerialToDateString(rawCreate);
            if (parsedCreate) {
              createTime = parsedCreate;
            } else {
              const isNumericString = typeof rawCreate === 'string' && /^[0-9\.]+$/.test(rawCreate);
              if (typeof rawCreate === 'number' || isNumericString) {
                appendImportDebugAsync({ time: nowStr(), note: 'createTime numeric raw rejected, fallback to now', rawCreate: rawCreate });
                createTime = nowStr();
              } else if (typeof rawCreate === 'string') {
                createTime = rawCreate;
              }
            }
          }

          const taoRenRaw = (clue.taoRen || '').toString().trim();
          const channel = normalizeChannelName(clue.channel || '');
          const name = clue.name || '';
          const gender = clue.gender || '';
          const age = clue.age ? parseInt(clue.age, 10) : null;
          const phone = clue.phone || '';
          const wechat = clue.wechat || '';
          const doctor = clue.doctor || '';
          const regDoctor = clue.regDoctor || doctor || '';
          const department = clue.department || '';
          const preCase = clue.preCase || '';
          const content = clue.content || '';
          const intent = clue.intent || '';
          const visitStatus = clue.visitStatus || '';
          const bookUser = clue.bookUser || '';
          const book = clue.book || '';
          const arrive = clue.arrive || '';
          const medicineDay = clue.medicineDay || '';
          const cost = clue.cost ? parseInt(clue.cost, 10) || 0 : '';
          const visitMode = clue.visitMode || '';
          const visitDateRaw = clue.visitDate !== undefined && clue.visitDate !== null ? clue.visitDate : '';
          const visitDate = excelSerialToDateString(visitDateRaw) || (typeof visitDateRaw === 'string' ? visitDateRaw : '');

          const bookTimeRaw = clue.bookTime || null;
          const firstConsultTimeRaw = clue.firstConsultTime || clue.assignedAt || null;
          const bookTime = excelSerialToDateString(bookTimeRaw) || (typeof bookTimeRaw === 'string' ? bookTimeRaw : null);
          const firstConsultTime = excelSerialToDateString(firstConsultTimeRaw) || (typeof firstConsultTimeRaw === 'string' ? firstConsultTimeRaw : null);

          let username = req.user.username;
          if (clue.username && (req.user.role === '主管' || req.user.role === '超级管理员')) username = clue.username;
          const taoRen = taoRenRaw || username || req.user.username;

          const phoneTrim = (phone || '').toString().trim();
          const wechatTrim = (wechat || '').toString().trim();
          let markDupToExpire = null;
          const requestedParentClueId = clue.parentClueId && String(clue.parentClueId).trim() !== '' ? String(clue.parentClueId).trim() : null;
          let linkParentClueId = requestedParentClueId;
          try {
            if ((phoneTrim || wechatTrim) && !requestedParentClueId) {
              const [dupRows] = await conn.execute('SELECT id, createTime, doctor, taoRen, phone, wechat, intent, book FROM clues WHERE (phone = ? AND phone <> "") OR (wechat = ? AND wechat <> "") LIMIT 1', [phoneTrim, wechatTrim]);
              const dup = dupRows && dupRows.length > 0 ? dupRows[0] : null;
              if (dup) {
                const expired = await computeExpiredAsync(dup);
                if (expired) {
                  if (!allowForceInsert) {
                    skipped++;
                    errors.push({ phone: phoneTrim, wechat: wechatTrim, reason: 'duplicate_expired_requires_confirm', message: '重复且为过期单，未确认重录' });
                    pendingConflicts.push(
                      conflictByRowIndex.get(i) || {
                        rowIndex: i,
                        existingId: dup.id,
                        existing: dup,
                        incoming: clue,
                        changes: {},
                      }
                    );
                    try {
                      await conn.execute('INSERT INTO import_skips (phone,wechat,reason,raw) VALUES (?,?,?,?)', [phoneTrim || null, wechatTrim || null, 'duplicate_expired_requires_confirm', JSON.stringify(clue || {})]);
                    } catch (_) {}
                    continue;
                  }
                  const dupDoctor = (dup.doctor || '').toString();
                  const reqDoctor = (doctor || '').toString();
                  if (dupDoctor && reqDoctor && dupDoctor === reqDoctor) {
                    skipped++;
                    errors.push({ phone: phoneTrim, wechat: wechatTrim, reason: 'duplicate_same_doctor', message: '过期单同医生不允许重录' });
                    try {
                      await conn.execute('INSERT INTO import_skips (phone,wechat,reason,raw) VALUES (?,?,?,?)', [phoneTrim || null, wechatTrim || null, 'duplicate_same_doctor', JSON.stringify(clue || {})]);
                    } catch (_) {}
                    continue;
                  }
                  markDupToExpire = dup.id;
                  if (!linkParentClueId && dup.id) linkParentClueId = String(dup.id);
                } else {
                  skipped++;
                  errors.push({ phone: phoneTrim, wechat: wechatTrim, reason: 'duplicate_active', message: '重复且未过期，跳过导入' });
                  try {
                    await conn.execute('INSERT INTO import_skips (phone,wechat,reason,raw) VALUES (?,?,?,?)', [phoneTrim || null, wechatTrim || null, 'duplicate_active', JSON.stringify(clue || {})]);
                  } catch (_) {}
                  continue;
                }
              }
            }
          } catch (checkErr) {
            console.error('duplicate check error, continuing with insert attempt', checkErr);
          }

          linkParentClueId = await resolveIntroRootParentClueId({ channel, phone: phoneTrim }, linkParentClueId);

          let done = false;
          for (let attempt = 0; attempt < 5 && !done; attempt++) {
            const id = Date.now() + Math.floor(Math.random() * 10000) + attempt;
            try {
              await conn.execute(
                'INSERT INTO clues (id,taoRen,channel,name,gender,age,phone,wechat,doctor,regDoctor,department,preCase,content,intent,visitStatus,bookUser,book,bookTime,arrive,medicineDay,cost,visitMode,visitDate,createTime,firstConsultTime,username,parentClueId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [id, taoRen, channel, name, gender, age, phoneTrim, wechatTrim, doctor, regDoctor, department, preCase, content, intent, visitStatus, bookUser, book, bookTime, arrive, medicineDay, cost, visitMode, visitDate, createTime, firstConsultTime, username, linkParentClueId || null]
              );

              if (intent && !firstConsultTime) {
                await conn.execute('UPDATE clues SET firstConsultTime = ? WHERE id = ?', [createTime, id]);
              }
              if (book === '已预约' && !bookTime) {
                await conn.execute('UPDATE clues SET bookTime = ? WHERE id = ?', [createTime, id]);
              }

              if (markDupToExpire) {
                try {
                  const [rr] = await conn.execute('SELECT intent, book FROM clues WHERE id = ?', [markDupToExpire]);
                  const info = rr && rr[0] ? rr[0] : null;
                  let reason = '';
                  if (info) {
                    if (('' + (info.intent || '')).toString() === '无效') {
                      reason = '意向为 无效';
                    } else {
                      const [vt] = await conn.execute('SELECT MAX(time) AS lastTime FROM visits WHERE clueId = ?', [markDupToExpire]);
                      const lastTime = vt && vt[0] ? vt[0].lastTime : null;
                      if (lastTime) {
                        reason = `最后回访时间：${lastTime}，超过 15 天且未预约`;
                      } else {
                        reason = '系统判定为过期单';
                      }
                      const oldBook = (info.book || '').toString();
                      if (oldBook && oldBook !== '' && oldBook !== '未预约') {
                        reason = reason + `（当前预约状态：${oldBook}）`;
                      }
                    }
                  }
                  await conn.execute('UPDATE clues SET visitStatus = ?, expired = 1, expiredReason = ? WHERE id = ?', ['过期单', reason, markDupToExpire]);
                  await addLog(req.user.username, `导入重录并标记过期单：${markDupToExpire} 原因：${reason}`);
                } catch (e) {
                  console.warn('import mark dup expired failed', e && e.message ? e.message : e);
                }
              }

              imported++;
              done = true;
            } catch (err) {
              if (err && err.code === 'ER_DUP_ENTRY') {
                console.warn('duplicate id on import, retrying', attempt, err.message || err);
                await new Promise((r) => setTimeout(r, 5));
                continue;
              }
              const dbg = {
                time: nowStr(),
                phase: 'insert_error',
                code: err && err.code,
                message: err && err.message,
                rowSample: { phone: phoneTrim, wechat: wechatTrim, name: name },
              };
              appendImportDebugAsync(dbg);
              console.error('insert clue error, skipping row', err);
              errors.push({ phone: phoneTrim, wechat: wechatTrim, reason: 'insert_error', message: err && err.message ? err.message : 'insert_error' });
              done = true;
            }
          }
        }
      } catch (e) {
        console.error('import loop error', e);
      } finally {
        conn.release();
      }
      await addLog(req.user.username, `批量导入线索：${imported}条`);
      return res.json({
        code: 200,
        data: {
          imported: imported,
          skipped: skipped,
          failed: errors.length,
          errors: errors.slice(0, 100),
          pendingConflicts: pendingConflicts,
          pendingConfirmCount: pendingConflicts.length,
        },
      });
    } catch (e) {
      console.error('import error', e);
      return res.json({ code: 500, msg: '导入失败' });
    }
  });

  app.post('/api/importPreview', authMiddleware, async (req, res) => {
    try {
      const activePool = ensurePoolReady(res);
      if (!activePool) return;
      if (!canImportByRole(req.user && req.user.role)) return res.status(403).json({ code: 403, msg: '无权限预览导入' });
      const { clues } = req.body;
      if (!Array.isArray(clues)) return res.json({ code: 400, msg: '数据格式错误' });
      const requiredErrors = [];
      for (let i = 0; i < clues.length; i++) {
        const clue = clues[i] || {};
        const errs = getCreateRequiredErrors(clue);
        if (errs.length > 0) {
          requiredErrors.push({ row: i + 1, missing: errs });
        }
      }
      const conflicts = [];
      const conn = await activePool.getConnection();
      try {
        const r = await collectImportConflicts(conn, clues);
        conflicts.push(...r);
      } catch (e) {
        console.error('importPreview loop error', e);
      } finally {
        conn.release();
      }
      return res.json({ code: 200, data: { conflicts: conflicts, requiredErrors: requiredErrors } });
    } catch (e) {
      console.error('importPreview error', e);
      return res.json({ code: 500, msg: '预览失败' });
    }
  });

  app.post('/api/exportClues', authMiddleware, async (req, res) => {
    try {
      const body = req.body || {};
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
      let rows = [];

      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        let sql = `SELECT * FROM clues WHERE id IN (${placeholders})`;
        const params = ids.slice();
        if (req.user && req.user.role === '咨询') {
          sql += ` AND ${buildConsultAssigneeExpr('clues')} = ?`;
          params.push(req.user.username);
        } else if (!(req.user.role === '主管' || req.user.role === '超级管理员' || req.user.role === '医助')) {
          sql += ' AND username = ?';
          params.push(req.user.username);
        }
        sql += ' ORDER BY createTime DESC';
        rows = await query(sql, params);
      } else {
        const { startDate, endDate, doctor } = body;
        if (!startDate || !endDate) return res.json({ code: 400, msg: '请选择日期范围' });
        let sql = 'SELECT * FROM clues WHERE DATE(COALESCE(visitDate, bookTime, createTime)) BETWEEN ? AND ?';
        const params = [startDate, endDate];
        if (doctor && ('' + doctor).trim() !== '') {
          sql += ' AND doctor = ?';
          params.push(('' + doctor).trim());
        }
        if (req.user && req.user.role === '咨询') {
          sql += ` AND ${buildConsultAssigneeExpr('clues')} = ?`;
          params.push(req.user.username);
        } else if (!(req.user.role === '主管' || req.user.role === '超级管理员' || req.user.role === '医助')) {
          sql += ' AND username = ?';
          params.push(req.user.username);
        }
        rows = await query(sql, params);
      }

      let visits = [];
      if (rows && rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const placeholders = ids.map(() => '?').join(',');
        const visitSql = `SELECT clueId, time, user, content FROM visits WHERE clueId IN (${placeholders}) ORDER BY clueId, time DESC`;
        visits = await query(visitSql, ids);
      }

      return res.json({ code: 200, data: { clues: rows, visits: visits } });
    } catch (e) {
      console.error('export error', e);
      return res.json({ code: 500, msg: '导出失败' });
    }
  });
}

module.exports = {
  registerCluesIoRoutes,
};
