function registerCluesWriteRoutes(deps) {
  const app = deps.app;
  const query = deps.query;
  const execute = deps.execute;
  const addLog = deps.addLog;
  const nowStr = deps.nowStr;
  const authMiddleware = deps.authMiddleware;
  const ALLOWED_CLUE_UPDATE_KEYS = deps.ALLOWED_CLUE_UPDATE_KEYS;

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

  function normalizeLogValue(v) {
    if (v === null) return 'NULL';
    if (typeof v === 'undefined') return '(undefined)';
    let s = '';
    try {
      if (v instanceof Date && !Number.isNaN(v.getTime())) {
        s = v.toISOString().slice(0, 19).replace('T', ' ');
      } else {
        s = String(v);
      }
    } catch (_) {
      s = '[unprintable]';
    }
    s = s.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (s === '') return "''";
    if (s.length > 80) return s.slice(0, 77) + '...';
    return s;
  }

  function buildUpdateChangeSummary(beforeRow, updates) {
    const keys = Object.keys(updates || {});
    if (keys.length === 0) return '';
    const parts = [];
    for (const k of keys) {
      const oldVal = beforeRow ? beforeRow[k] : undefined;
      const newVal = updates[k];
      if (String(oldVal) === String(newVal)) continue;
      parts.push(`${k}:${normalizeLogValue(oldVal)}=>${normalizeLogValue(newVal)}`);
      const preview = parts.join('; ');
      if (preview.length > 700) break;
    }
    const text = parts.join('; ');
    if (!text) return '';
    return text.length > 700 ? text.slice(0, 697) + '...' : text;
  }

  function normalizeLinkField(v) {
    if (v === null || typeof v === 'undefined') return '';
    return String(v).trim();
  }

  function shouldClearParentLink(beforeRow, updates) {
    try {
      if (!beforeRow) return false;
      const hasParentLink = beforeRow.parentClueId !== null && typeof beforeRow.parentClueId !== 'undefined' && String(beforeRow.parentClueId).trim() !== '';
      if (!hasParentLink) return false;
      if (!updates || typeof updates !== 'object') return false;
      const hasPhone = Object.prototype.hasOwnProperty.call(updates, 'phone');
      const hasWechat = Object.prototype.hasOwnProperty.call(updates, 'wechat');
      if (!hasPhone && !hasWechat) return false;
      const phoneChanged = hasPhone && normalizeLinkField(beforeRow.phone) !== normalizeLinkField(updates.phone);
      const wechatChanged = hasWechat && normalizeLinkField(beforeRow.wechat) !== normalizeLinkField(updates.wechat);
      return phoneChanged || wechatChanged;
    } catch (_) {
      return false;
    }
  }

  app.post('/api/assignClues', authMiddleware, async (req, res) => {
    try {
      const body = req.body || {};
      if (!(req.user.role === '主管' || req.user.role === '超级管理员')) return res.status(403).json({ code: 403, msg: '无权限分配' });
      const assignedTo = (body.assignedTo || '').toString();
      const note = body.note || '';
      const source = (body.source || '').toString();
      const isPublicPoolSource = source === 'publicPool';
      let ids = Array.isArray(body.ids) ? body.ids.slice() : [];

      if (!assignedTo) return res.json({ code: 400, msg: 'assignedTo 必填' });

      if ((!ids || ids.length === 0) && body.filter && typeof body.filter === 'object') {
        let fsql = 'SELECT id FROM clues WHERE 1=1';
        const fparams = [];
        fsql += " AND (COALESCE(revisitGroupId, '') = '')";
        const f = body.filter || {};
        if (f.intent) {
          fsql += ' AND intent = ?';
          fparams.push(f.intent);
        }
        if (f.channel) {
          fsql += ' AND channel = ?';
          fparams.push(f.channel);
        }
        if (f.visitStatus) {
          if (f.visitStatus === '未回访') {
            fsql += " AND (COALESCE(visitStatus,'') = '' OR visitStatus = '未回访')";
          } else {
            fsql += ' AND visitStatus = ?';
            fparams.push(f.visitStatus);
          }
        }
        if (f.doctor) {
          fsql += ' AND doctor = ?';
          fparams.push(f.doctor);
        }
        if (f.book) {
          fsql += ' AND book = ?';
          fparams.push(f.book);
        }
        if (f.arrive) {
          fsql += ' AND arrive = ?';
          fparams.push(f.arrive);
        }
        if (f.taoRen) {
          fsql += ' AND taoRen = ?';
          fparams.push(f.taoRen);
        }
        if (f.bookUser) {
          fsql += ' AND bookUser = ?';
          fparams.push(f.bookUser);
        }
        if (f.assignedTo) {
          fsql += ` AND ${buildConsultAssigneeExpr('clues')} = ?`;
          fparams.push(f.assignedTo);
        }
        if (f.name) {
          fsql += ' AND name LIKE ?';
          fparams.push('%' + f.name + '%');
        }
        if (f.phone) {
          fsql += ' AND phone LIKE ?';
          fparams.push('%' + f.phone + '%');
        }
        if (f.wechat) {
          fsql += ' AND wechat LIKE ?';
          fparams.push('%' + f.wechat + '%');
        }
        if (f.startDate) {
          fsql += ' AND createTime >= ?';
          fparams.push(f.startDate + ' 00:00:00');
        }
        if (f.endDate) {
          fsql += ' AND createTime <= ?';
          fparams.push(f.endDate + ' 23:59:59');
        }
        const rows = await query(fsql, fparams);
        ids = (rows || []).map((r) => r.id);
      }

      if (!ids || ids.length === 0) return res.json({ code: 400, msg: '没有要分配的记录' });

      const now = nowStr();
      const ph = ids.map(() => '?').join(',');
      const checkRows = await query(`SELECT id, visitStatus FROM clues WHERE id IN (${ph})`, ids);
      const skipped = [];
      const allowed = [];
      if (isPublicPoolSource) {
        for (const r of checkRows || []) {
          if (r && r.id) allowed.push(r.id);
        }
      } else {
        for (const r of checkRows || []) {
          const vs = r && r.visitStatus ? '' + r.visitStatus : '';
          if (vs.indexOf('访') !== -1) skipped.push(r.id);
          else allowed.push(r.id);
        }
      }
      if (allowed.length === 0) {
        return res.json({ code: 400, msg: `所选记录中 ${skipped.length} 条均为已回访（1访/2访/3访/4访），无法分配` });
      }
      const placeholders = allowed.map(() => '?').join(',');
      const sql = isPublicPoolSource
        ? `UPDATE clues SET assignedTo = ?, assignedBy = ?, assignedAt = ?, assignNote = ?, expired = 0, expiredReason = NULL, visitStatus = CASE WHEN visitStatus = '过期单' THEN '' ELSE visitStatus END WHERE id IN (${placeholders})`
        : `UPDATE clues SET assignedTo = ?, assignedBy = ?, assignedAt = ?, assignNote = ? WHERE id IN (${placeholders})`;
      await execute(sql, [assignedTo, req.user.username, now, note].concat(allowed));
      const assignedIdsText = allowed.join(',');
      const skippedIdsText = skipped.join(',');
      const sourceLabel = isPublicPoolSource ? '公海再分配' : '常规分配';
      await addLog(
        req.user.username,
        `分配线索[${sourceLabel}] 时间:${now} 分配给:${assignedTo} 成功:${allowed.length}条 ID:[${assignedIdsText}] 跳过:${skipped.length}条${skipped.length > 0 ? ` ID:[${skippedIdsText}]` : ''}`
      );
      return res.json({ code: 200, data: { assigned: allowed.length, skipped: skipped.length } });
    } catch (e) {
      console.error('assignClues error', e);
      return res.json({ code: 500, msg: '分配失败' });
    }
  });

  app.post('/api/update', authMiddleware, async (req, res) => {
    try {
      const { id, key, val } = req.body;
      if (!id) return res.json({ code: 400, msg: 'id 为空' });
      if (!ALLOWED_CLUE_UPDATE_KEYS.has(key)) return res.status(400).json({ code: 400, msg: '不允许更新该字段' });
      if (key === 'createTime' && req.user.role !== '超级管理员') return res.status(403).json({ code: 403, msg: '无权限修改创建时间' });
      if (key === 'taoRen' && req.user.role !== '超级管理员') return res.json({ code: 200, msg: 'skipped taoRen' });
      const beforeRows = await query('SELECT id, parentClueId, phone, wechat FROM clues WHERE id = ? LIMIT 1', [id]);
      const beforeRow = beforeRows && beforeRows[0] ? beforeRows[0] : null;
      const clearParentLinkAfterUpdate = shouldClearParentLink(beforeRow, { [key]: val });
      try {
        const protectedKeys = ['name', 'phone', 'wechat', 'gender', 'age'];
        if (protectedKeys.includes(key) && (val === '' || val === null)) {
          console.warn('Ignored empty update for protected field', { id: id, key: key, user: req.user && req.user.username });
          return res.json({ code: 200, msg: 'skipped empty update' });
        }
      } catch (_) {}
      try {
        console.debug && console.debug('api/update received', { id: id, key: key, val: val, valType: typeof val, user: req.user && req.user.username });
      } catch (_) {}

      const now = nowStr();
      if (key === 'intent') {
        const rows = await query('SELECT firstConsultTime FROM clues WHERE id = ?', [id]);
        const item = rows[0];
        const sets = [];
        const params = [];
        if (item && !item.firstConsultTime && val) {
          sets.push('firstConsultTime = ?');
          params.push(now);
        }
        if (val && (req.user.role === '咨询' || req.user.role === '主管' || req.user.role === '超级管理员')) {
          try {
            const cntRows = await query('SELECT COUNT(*) as c FROM visits WHERE clueId = ?', [id]);
            const c = cntRows && cntRows[0] && cntRows[0].c ? parseInt(cntRows[0].c, 10) : 0;
            if (c === 0) {
              sets.push('visitStatus = ?');
              params.push('1访');
            }
          } catch (_) {}
        }
        sets.push('`' + key + '` = ?');
        params.push(val);
        if (val) {
          sets.push('intentOperator = ?');
          params.push(req.user.username);
        }
        const sql = `UPDATE clues SET ${sets.join(', ')} WHERE id = ?`;
        params.push(id);
        await execute(sql, params);
      } else if (key === 'visitDate') {
        let visitVal = val;
        if (visitVal === null || visitVal === undefined) visitVal = '';
        const sql = 'UPDATE clues SET visitDate = ? WHERE id = ?';
        await execute(sql, [visitVal, id]);
      } else {
        if (key === 'book') {
          if (val === '已预约') {
            const sql = "UPDATE clues SET `book` = ?, bookUser = ?, bookTime = ?, regDoctor = CASE WHEN COALESCE(regDoctor, '') = '' THEN doctor ELSE regDoctor END WHERE id = ?";
            await execute(sql, [val, req.user.username, nowStr(), id]);
          } else {
            const sql = 'UPDATE clues SET `book` = ?, bookTime = NULL, visitDate = NULL WHERE id = ?';
            const clearVal = val === null || val === undefined ? '' : val;
            await execute(sql, [clearVal, id]);
          }
        } else if (key === 'arrive') {
          let arriveVal = val;
          if (arriveVal === '已到院') arriveVal = '已到诊';
          if (arriveVal === '已到诊') {
            const sql = 'UPDATE clues SET `arrive` = ?, arriveOperatorRole = ? WHERE id = ?';
            await execute(sql, [arriveVal, req.user.role, id]);
          } else {
            const sql = 'UPDATE clues SET `arrive` = ?, arriveOperatorRole = NULL WHERE id = ?';
            await execute(sql, [arriveVal, id]);
          }
          try {
            const rr = await query('SELECT id, revisitGroupId FROM clues WHERE id = ?', [id]);
            const thisRow = rr && rr[0];
            if (thisRow) {
              const groupKey = thisRow.revisitGroupId || thisRow.id;
              const cntRows = await query("SELECT COUNT(*) as c FROM clues WHERE COALESCE(revisitGroupId, id) = ? AND arrive = '已到诊'", [groupKey]);
              const c = cntRows && cntRows[0] && cntRows[0].c ? cntRows[0].c : 0;
              await execute('UPDATE clues SET visitCount = ? WHERE id = ?', [String(c), groupKey]);
            }
          } catch (e) {
            console.warn('recompute visitCount failed', e.message || e);
          }
        } else {
          if (key === 'doctor') {
            const sql = "UPDATE clues SET `doctor` = ?, regDoctor = CASE WHEN COALESCE(regDoctor, '') = '' OR regDoctor = doctor THEN ? ELSE regDoctor END WHERE id = ?";
            await execute(sql, [val, val, id]);
            await addLog(req.user.username, `修改 ${id} ${key}=${val}`);
            return res.json({ code: 200 });
          }
          const sql = `UPDATE clues SET \`${key}\` = ? WHERE id = ?`;
          await execute(sql, [val, id]);
        }
      }
      if (clearParentLinkAfterUpdate) {
        await execute('UPDATE clues SET parentClueId = NULL WHERE id = ?', [id]);
      }
      await addLog(req.user.username, `修改 ${id} ${key}=${val}`);
      return res.json({ code: 200 });
    } catch (e) {
      console.error('update error', e);
      return res.json({ code: 500, msg: '更新失败' });
    }
  });

  app.post('/api/updateMany', authMiddleware, async (req, res) => {
    try {
      const { id, updates } = req.body || {};
      if (!id) return res.json({ code: 400, msg: 'id 为空' });
      if (!updates || typeof updates !== 'object') return res.json({ code: 400, msg: 'updates 格式错误' });
      const incomingKeys = Object.keys(updates || {});
      const invalidKeys = incomingKeys.filter((k) => !ALLOWED_CLUE_UPDATE_KEYS.has(k));
      if (invalidKeys.length > 0) return res.status(400).json({ code: 400, msg: '存在非法字段: ' + invalidKeys.join(',') });

      // 权限检查：只有超级管理员可以修改 taoRen，其他角色静默忽略
      if (Object.prototype.hasOwnProperty.call(updates, 'taoRen') && req.user.role !== '超级管理员') {
        delete updates.taoRen;
      }

      const protectedKeys = ['name', 'phone', 'wechat', 'gender', 'age'];
      const special = ['intent', 'visitDate', 'book', 'arrive'];
      const beforeRows = await query('SELECT * FROM clues WHERE id = ? LIMIT 1', [id]);
      const beforeRow = beforeRows && beforeRows[0] ? beforeRows[0] : null;
      const clearParentLinkInThisUpdate = shouldClearParentLink(beforeRow, updates);
      const appliedUpdates = {};

      const sets = [];
      const params = [];

      if (Object.prototype.hasOwnProperty.call(updates, 'refundAmount')) {
        const raw = updates.refundAmount;
        if (!(raw === '' || raw === null || typeof raw === 'undefined')) {
          const n = Number(raw);
          if (Number.isFinite(n) && n < 0) {
            return res.status(400).json({ code: 400, msg: '退费金额不能小于 0' });
          }
        }
      }

      if (typeof updates.intent !== 'undefined') {
        const val = updates.intent;
        appliedUpdates.intent = val;
        try {
          const rows = await query('SELECT firstConsultTime FROM clues WHERE id = ?', [id]);
          const item = rows && rows[0] ? rows[0] : null;
          if (item && !item.firstConsultTime && val) {
            sets.push('firstConsultTime = ?');
            params.push(nowStr());
          }
        } catch (_) {}
        if (val) {
          try {
            const cntRows = await query('SELECT COUNT(*) as c FROM visits WHERE clueId = ?', [id]);
            const c = cntRows && cntRows[0] && cntRows[0].c ? parseInt(cntRows[0].c, 10) : 0;
            if (c === 0) {
              sets.push('visitStatus = ?');
              params.push('1访');
            }
          } catch (_) {}
        }
        sets.push('`intent` = ?');
        params.push(val);
        if (val) {
          sets.push('intentOperator = ?');
          params.push(req.user.username);
        }
      }

      if (typeof updates.visitDate !== 'undefined') {
        let visitVal = updates.visitDate;
        if (visitVal === null || visitVal === undefined) visitVal = '';
        appliedUpdates.visitDate = visitVal;
        sets.push('visitDate = ?');
        params.push(visitVal);
      }

      if (typeof updates.book !== 'undefined') {
        const val = updates.book;
        if (val === '已预约') {
          appliedUpdates.book = val;
          sets.push('`book` = ?');
          params.push(val);
          sets.push('bookUser = ?');
          params.push(req.user.username);
          sets.push('bookTime = ?');
          params.push(nowStr());
          sets.push("regDoctor = CASE WHEN COALESCE(regDoctor, '') = '' THEN doctor ELSE regDoctor END");
        } else {
          const clearVal = val === null || val === undefined ? '' : val;
          appliedUpdates.book = clearVal;
          sets.push('`book` = ?');
          params.push(clearVal);
          sets.push('bookTime = NULL');
          sets.push('visitDate = NULL');
        }
      }

      if (typeof updates.arrive !== 'undefined') {
        let val = updates.arrive;
        if (val === '已到院') val = '已到诊';
        appliedUpdates.arrive = val;
        if (val === '已到诊') {
          sets.push('`arrive` = ?');
          params.push(val);
          sets.push('arriveOperatorRole = ?');
          params.push(req.user.role);
        } else {
          sets.push('`arrive` = ?');
          params.push(val);
          sets.push('arriveOperatorRole = NULL');
        }
      }

      if (typeof updates.doctor !== 'undefined' && typeof updates.regDoctor === 'undefined') {
        sets.push("regDoctor = CASE WHEN COALESCE(regDoctor, '') = '' OR regDoctor = doctor THEN ? ELSE regDoctor END");
        params.push(updates.doctor);
      }

      const decimalFields = new Set(['regFee', 'cost', 'treatmentFee', 'refundAmount']);
      for (const k of Object.keys(updates)) {
        if (special.includes(k)) continue;
        let val = updates[k];
        if (typeof val === 'undefined') continue;
        if (protectedKeys.includes(k) && (val === '' || val === null)) {
          console.warn('updateMany: skip empty protected key', { id: id, k: k, user: req.user && req.user.username });
          continue;
        }
        if (decimalFields.has(k) && (val === '' || val === undefined)) val = null;
        appliedUpdates[k] = val;
        sets.push('`' + k + '` = ?');
        params.push(val);
      }

      if (sets.length > 0) {
        if (clearParentLinkInThisUpdate && !Object.prototype.hasOwnProperty.call(updates, 'parentClueId')) {
          sets.push('parentClueId = NULL');
          appliedUpdates.parentClueId = null;
        }
        const sql = `UPDATE clues SET ${sets.join(', ')} WHERE id = ?`;
        params.push(id);
        await execute(sql, params);
      }

      if (typeof updates.arrive !== 'undefined') {
        try {
          const rr = await query('SELECT id, revisitGroupId FROM clues WHERE id = ?', [id]);
          const thisRow = rr && rr[0];
          if (thisRow) {
            const groupKey = thisRow.revisitGroupId || thisRow.id;
            const cntRows = await query("SELECT COUNT(*) as c FROM clues WHERE COALESCE(revisitGroupId, id) = ? AND arrive = '已到诊'", [groupKey]);
            const c = cntRows && cntRows[0] && cntRows[0].c ? cntRows[0].c : 0;
            await execute('UPDATE clues SET visitCount = ? WHERE id = ?', [String(c), groupKey]);
          }
        } catch (e) {
          console.warn('recompute visitCount failed', e.message || e);
        }
      }

      const appliedKeys = Object.keys(appliedUpdates);
      const changeSummary = buildUpdateChangeSummary(beforeRow, appliedUpdates);
      await addLog(
        req.user.username,
        `批量修改 ${id} keys=${appliedKeys.join(',')}${changeSummary ? ' changes=' + changeSummary : ''}`
      );
      return res.json({ code: 200 });
    } catch (e) {
      console.error('updateMany error', e);
      return res.json({ code: 500, msg: '批量更新失败' });
    }
  });

  app.post('/api/updateClue', authMiddleware, async (req, res) => {
    try {
      const { id, updates } = req.body;
      if (!id || !updates) return res.json({ code: 400, msg: '参数不完整' });
      const incomingKeys = Object.keys(updates || {});
      const invalidKeys = incomingKeys.filter((k) => !ALLOWED_CLUE_UPDATE_KEYS.has(k));
      if (invalidKeys.length > 0) return res.status(400).json({ code: 400, msg: '存在非法字段: ' + invalidKeys.join(',') });
      if (Object.prototype.hasOwnProperty.call(updates, 'createTime') && req.user.role !== '超级管理员') {
        return res.status(403).json({ code: 403, msg: '无权限修改创建时间' });
      }
      // 非超管静默忽略 taoRen，不阻断整个保存
      if (Object.prototype.hasOwnProperty.call(updates, 'taoRen') && req.user.role !== '超级管理员') {
        delete updates.taoRen;
      }
      const sets = [];
      const params = [];

      if (Object.prototype.hasOwnProperty.call(updates, 'refundAmount')) {
        const raw = updates.refundAmount;
        if (!(raw === '' || raw === null || typeof raw === 'undefined')) {
          const n = Number(raw);
          if (Number.isFinite(n) && n < 0) {
            return res.status(400).json({ code: 400, msg: '退费金额不能小于 0' });
          }
        }
      }
      const rows = await query('SELECT * FROM clues WHERE id = ? LIMIT 1', [id]);
      const item = rows && rows[0] ? rows[0] : null;
      const clearParentLinkInThisUpdate = shouldClearParentLink(item, updates);
      const appliedUpdates = {};
      try {
        if (req.user && req.user.role === '咨询') {
          const owner = item && item.assignedTo ? '' + item.assignedTo : '';
          if (owner !== (req.user.username || '')) {
            return res.status(403).json({ code: 403, msg: '无权限修改该线索' });
          }
        }
      } catch (_) {}
      if (updates.intent && updates.intent && !item.firstConsultTime) {
        sets.push('firstConsultTime = ?');
        params.push(nowStr());
      }
      if (updates.intent && updates.intent && (req.user.role === '咨询' || req.user.role === '主管' || req.user.role === '超级管理员')) {
        try {
          const cntRows = await query('SELECT COUNT(*) as c FROM visits WHERE clueId = ?', [id]);
          const c = cntRows && cntRows[0] && cntRows[0].c ? parseInt(cntRows[0].c, 10) : 0;
          let vs = '';
          if (c === 0) vs = '1访';
          else if (c === 1) vs = '1访';
          else if (c === 2) vs = '2访';
          else if (c === 3) vs = '3访';
          else vs = '4访';
          sets.push('visitStatus = ?');
          params.push(vs);
        } catch (_) {}
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'intent') && updates.intent) {
        sets.push('intentOperator = ?');
        params.push(req.user.username);
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'book')) {
        if (updates.book === '已预约') {
          sets.push('bookTime = ?');
          params.push(nowStr());
          sets.push("regDoctor = CASE WHEN COALESCE(regDoctor, '') = '' THEN doctor ELSE regDoctor END");
          if (!Object.prototype.hasOwnProperty.call(updates, 'bookUser') || !updates.bookUser) {
            updates.bookUser = req.user.username;
          }
        } else {
          sets.push('bookTime = NULL');
          sets.push('visitDate = NULL');
        }
        if (updates.book === null || updates.book === undefined) updates.book = '';
        appliedUpdates.book = updates.book;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'arrive')) {
        if (updates.arrive === '已到院') updates.arrive = '已到诊';
        appliedUpdates.arrive = updates.arrive;
        if (updates.arrive === '已到诊') {
          sets.push('arriveOperatorRole = ?');
          params.push(req.user.role);
        } else {
          sets.push('arriveOperatorRole = NULL');
        }
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'doctor') && !Object.prototype.hasOwnProperty.call(updates, 'regDoctor')) {
        sets.push("regDoctor = CASE WHEN COALESCE(regDoctor, '') = '' OR regDoctor = doctor THEN ? ELSE regDoctor END");
        params.push(updates.doctor);
      }
      for (const k of Object.keys(updates)) {
        let val = updates[k];
        if (k === 'age') {
          if (val === '' || val === null || val === undefined) {
            val = null;
          } else {
            const n = parseInt(val, 10);
            val = Number.isFinite(n) ? n : null;
          }
        }
        if (k === 'cost') {
          if (val === '' || val === null || val === undefined) {
            val = null;
          } else {
            const f = parseFloat(val);
            val = Number.isFinite(f) ? f : null;
          }
        }
        if (k === 'treatmentFee') {
          if (val === '' || val === null || val === undefined) {
            val = null;
          } else {
            const f = parseFloat(val);
            val = Number.isFinite(f) ? f : null;
          }
        }
        if (k === 'refundAmount') {
          if (val === '' || val === null || val === undefined) {
            val = null;
          } else {
            const f = parseFloat(val);
            val = Number.isFinite(f) ? f : null;
          }
        }
        appliedUpdates[k] = val;
        sets.push('`' + k + '` = ?');
        params.push(val);
      }
      if (clearParentLinkInThisUpdate && !Object.prototype.hasOwnProperty.call(updates, 'parentClueId')) {
        sets.push('parentClueId = NULL');
        appliedUpdates.parentClueId = null;
      }
      const sql = `UPDATE clues SET ${sets.join(', ')} WHERE id = ?`;
      params.push(id);
      await execute(sql, params);
      const changeSummary = buildUpdateChangeSummary(item, appliedUpdates);
      const appliedKeys = Object.keys(appliedUpdates);
      await addLog(
        req.user.username,
        `批量修改 ${id} keys=${appliedKeys.join(',')}${changeSummary ? ' changes=' + changeSummary : ''}`
      );
      return res.json({ code: 200 });
    } catch (e) {
      console.error('updateClue error', e);
      return res.json({ code: 500, msg: '更新失败' });
    }
  });
}

module.exports = {
  registerCluesWriteRoutes,
};
