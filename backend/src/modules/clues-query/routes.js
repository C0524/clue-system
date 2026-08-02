function registerCluesQueryRoutes(deps) {
  const app = deps.app;
  const query = deps.query;
  const authMiddleware = deps.authMiddleware;
  const computeExpired = deps.computeExpired;
  let hasExpiredColumn = null;

  async function ensureExpiredColumnFlag() {
    if (hasExpiredColumn !== null) return hasExpiredColumn;
    try {
      const colRows = await query("SHOW COLUMNS FROM clues LIKE 'expired'");
      hasExpiredColumn = !!(colRows && colRows.length > 0);
    } catch (e) {
      console.warn('detect expired column failed', e && e.message ? e.message : e);
      hasExpiredColumn = false;
    }
    return hasExpiredColumn;
  }

  function buildPublicPoolRestoreExpr(clueAlias) {
    const c = clueAlias || 'clues';
    return `(COALESCE(${c}.assignNote, '') LIKE '%公海再分配%')`;
  }

  function buildParsedDateTimeExpr(rawExpr) {
    const expr = rawExpr || "''";
    return `COALESCE(STR_TO_DATE(NULLIF(TRIM(CAST(${expr} AS CHAR)), ''), '%Y-%m-%d %H:%i:%s'), STR_TO_DATE(NULLIF(TRIM(CAST(${expr} AS CHAR)), ''), '%Y-%m-%d'))`;
  }

  function buildExpireBaseTimeExpr(clueAlias) {
    const c = clueAlias || 'clues';
    const restoredExpr = buildPublicPoolRestoreExpr(c);
    const assignedAtExpr = buildParsedDateTimeExpr(`${c}.assignedAt`);
    const createTimeExpr = buildParsedDateTimeExpr(`${c}.createTime`);
    return `(CASE WHEN ${restoredExpr} THEN COALESCE(${assignedAtExpr}, ${createTimeExpr}) ELSE ${createTimeExpr} END)`;
  }

  function buildExpiredRuleExpr(clueAlias, hasExpired) {
    const c = clueAlias || 'clues';
    const baseTimeExpr = buildExpireBaseTimeExpr(c);
    const hardExpired = hasExpired
      ? `(COALESCE(${c}.expired, 0) = 1 OR COALESCE(${c}.visitStatus, '') = '过期单')`
      : `COALESCE(${c}.visitStatus, '') = '过期单'`;
    return `(
      (
        ${baseTimeExpr} IS NULL
        OR ${baseTimeExpr} <= DATE_SUB(NOW(), INTERVAL 30 DAY)
      )
      AND (
        ${hardExpired}
        OR ${c}.intent = '无效'
        OR (
          (COALESCE(${c}.book,'') = '' OR ${c}.book = '未预约')
          AND EXISTS (
            SELECT 1 FROM visits vv WHERE vv.clueId = ${c}.id GROUP BY vv.clueId HAVING GREATEST(IFNULL(MAX(vv.time), '1000-01-01 00:00:00'), IFNULL(${baseTimeExpr}, '1000-01-01 00:00:00')) <= DATE_SUB(NOW(), INTERVAL 15 DAY)
          )
        )
      )
    )`;
  }

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

  function appendTypedTimeRangeFilter(sql, params, body, clueAlias) {
    const c = clueAlias || 'clues';
    const type = body && body.timeType ? String(body.timeType) : '';
    const start = body && body.timeStart ? String(body.timeStart) : '';
    const end = body && body.timeEnd ? String(body.timeEnd) : '';
    if (!type || (!start && !end)) return sql;

    if (type === 'visitDate') {
      if (start) {
        sql += ` AND DATE(${c}.visitDate) >= DATE(?)`;
        params.push(start);
      }
      if (end) {
        sql += ` AND DATE(${c}.visitDate) <= DATE(?)`;
        params.push(end);
      }
      return sql;
    }

    if (type === 'assignedAt' || type === 'bookTime' || type === 'createTime') {
      if (start) {
        sql += ` AND ${c}.${type} >= ?`;
        params.push(start + ' 00:00:00');
      }
      if (end) {
        sql += ` AND ${c}.${type} <= ?`;
        params.push(end + ' 23:59:59');
      }
      return sql;
    }

    return sql;
  }

  async function buildVisitStatsMap(ids) {
    const map = {};
    if (!Array.isArray(ids) || ids.length === 0) return map;
    const ph = ids.map(() => '?').join(',');
    const rows = await query(`SELECT clueId, COUNT(*) as c, MAX(time) AS lastTime FROM visits WHERE clueId IN (${ph}) GROUP BY clueId`, ids);
    for (const row of rows || []) {
      map[String(row.clueId)] = {
        count: Number(row.c) || 0,
        lastTime: row.lastTime || null,
      };
    }
    return map;
  }

  function normalizeVisitStatus(row, visitCount) {
    const cur = row && row.visitStatus ? '' + row.visitStatus : '';
    const restored = !!(row && row.assignNote && String(row.assignNote).indexOf('公海再分配') !== -1);
    if (cur === '过期单' && !restored) return cur;
    if (/^\d+访$/.test(cur)) return cur;
    if (visitCount <= 0) return '未回访';
    if (visitCount === 1) return '1访';
    if (visitCount === 2) return '2访';
    if (visitCount === 3) return '3访';
    return '4访';
  }

  function enrichRows(rows, visitStatsMap, childCountMap, options) {
    const useIntentAsVisitCount = !!(options && options.useIntentAsVisitCount);
    return (rows || []).map((r) => {
      const stats = visitStatsMap[String(r.id)] || { count: 0, lastTime: null };
      const intentFlag = useIntentAsVisitCount && typeof r.intent === 'string' && r.intent.trim() !== '' && r.intent !== '无效' ? 1 : 0;
      const visitCount = Math.max(Number(stats.count) || 0, intentFlag);
      const expired = computeExpired(r, stats.lastTime);
      const out = Object.assign({}, r, {
        expired,
        lastVisitTime: stats.lastTime || null,
        visitStatus: normalizeVisitStatus(r, visitCount),
      });
      if (childCountMap) out.childCount = childCountMap[String(r.id)] || 0;
      return out;
    });
  }

  app.post('/api/list', authMiddleware, async (req, res) => {
    try {
      const body = req.body || {};
      const hasExpired = await ensureExpiredColumnFlag();
      if (req.user.role === '医助') return res.json({ code: 200, data: [] });

      let sql = '';
      const params = [];
      const page = parseInt(body.page, 10) || 1;
      const pageSize = parseInt(body.pageSize, 10) || 50;
      const wantAll = !!body.all;
      const SELECT_CLAUSES =
        'SELECT clues.*, (SELECT user FROM visits WHERE clueId = clues.id ORDER BY time ASC LIMIT 1) AS firstVisitUser FROM clues';

      if (body.id && !wantAll) {
        sql = SELECT_CLAUSES + ' WHERE id = ?';
        params.push(body.id);
      } else {
        sql = SELECT_CLAUSES + ' WHERE 1=1';
        sql += " AND (COALESCE(revisitGroupId, '') = '')";
        if (!body.includeExpired && !wantAll) {
          sql += ` AND NOT ${buildExpiredRuleExpr('clues', hasExpired)}`;
        }
        if (body.intent) {
          sql += ' AND intent = ?';
          params.push(body.intent);
        }
        if (body.channel) {
          sql += ' AND channel = ?';
          params.push(body.channel);
        }
        if (body.visitStatus) {
          if (body.visitStatus === '未回访') {
            sql += " AND ( (COALESCE(visitStatus,'') = '' OR visitStatus = '未回访') AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.clueId = clues.id) )";
          } else {
            sql += ' AND visitStatus = ?';
            params.push(body.visitStatus);
          }
        }
        if (body.doctor) {
          sql += ' AND doctor = ?';
          params.push(body.doctor);
        }
        if (body.regDoctor) {
          sql += ' AND COALESCE(NULLIF(regDoctor,\'\'), doctor) = ?';
          params.push(body.regDoctor);
        }
        if (body.book) {
          sql += ' AND book = ?';
          params.push(body.book);
        }
        if (body.arrive) {
          sql += ' AND arrive = ?';
          params.push(body.arrive);
        }
        if (body.taoRen) {
          sql += ' AND taoRen = ?';
          params.push(body.taoRen);
        }
        if (body.bookUser) {
          sql += ' AND bookUser = ?';
          params.push(body.bookUser);
        }
        if (body.assignedTo) {
          sql += ` AND ${buildConsultAssigneeExpr('clues')} = ?`;
          params.push(body.assignedTo);
        }
        if (body.name) {
          sql += ' AND name LIKE ?';
          params.push('%' + body.name + '%');
        }
        if (body.phone) {
          sql += ' AND phone LIKE ?';
          params.push('%' + body.phone + '%');
        }
        if (body.wechat) {
          sql += ' AND wechat LIKE ?';
          params.push('%' + body.wechat + '%');
        }
        if (body.startDate) {
          sql += ' AND createTime >= ?';
          params.push(body.startDate + ' 00:00:00');
        }
        if (body.endDate) {
          sql += ' AND createTime <= ?';
          params.push(body.endDate + ' 23:59:59');
        }
        sql = appendTypedTimeRangeFilter(sql, params, body, 'clues');
        if (body.quickFilter === 'todayBooked') {
          sql += " AND book = '已预约' AND bookTime IS NOT NULL AND bookTime <> '' AND DATE(bookTime)=CURDATE()";
        }
        if (body.quickFilter === 'todayArrived') {
          sql += " AND visitDate IS NOT NULL AND visitDate <> '' AND DATE(visitDate)=CURDATE()";
        }
      }

      if (req.user.role === '咨询') {
        sql += ` AND ${buildConsultAssigneeExpr('clues')} = ?`;
        params.push(req.user.username);
      } else if (!(req.user.role === '主管' || req.user.role === '超级管理员' || req.user.role === '套电' || req.user.role === '运营' || req.user.role === '数据')) {
        sql += ' AND username = ?';
        params.push(req.user.username);
      }

      sql += ' ORDER BY createTime DESC';

      if (body.id || wantAll) {
        const rows = await query(sql, params);
        try {
          const ids = (rows || []).map((r) => r && r.id).filter(Boolean);
          const visitStatsMap = await buildVisitStatsMap(ids);
          const outRows = enrichRows(rows, visitStatsMap);
          return res.json({ code: 200, data: outRows });
        } catch (e) {
          console.warn('normalize visitStatus for wantAll/id failed', e);
        }
        return res.json({ code: 200, data: enrichRows(rows, {}) });
      }

      const countSql = sql.replace(/SELECT[\s\S]*?FROM\s+clues/i, 'SELECT COUNT(*) as cnt FROM clues');
      const countRows = await query(countSql, params);
      const total = countRows && countRows[0] && countRows[0].cnt ? countRows[0].cnt : 0;

      const offset = (Math.max(1, page) - 1) * pageSize;
      const pagedSql = sql + ' LIMIT ? OFFSET ?';
      const pagedParams = params.slice();
      pagedParams.push(pageSize, offset);
      const rows = await query(pagedSql, pagedParams);
      const childCountMap = {};
      try {
        const childRows = await query("SELECT parentClueId, COUNT(*) as c FROM clues WHERE parentClueId IS NOT NULL AND parentClueId <> '' GROUP BY parentClueId");
        for (const row of childRows || []) {
          if (row && row.parentClueId) childCountMap[String(row.parentClueId)] = Number(row.c) || 0;
        }
      } catch (e) {
        console.warn('build childCount map failed', e);
      }
      try {
        const ids = (rows || []).map((r) => r && r.id).filter(Boolean);
        const visitStatsMap = await buildVisitStatsMap(ids);
        const outRows = enrichRows(rows, visitStatsMap, childCountMap);
        return res.json({ code: 200, data: { rows: outRows, total: total, page: page, pageSize: pageSize } });
      } catch (e) {
        console.warn('normalize visitStatus for paged rows failed', e);
      }
      return res.json({ code: 200, data: { rows: enrichRows(rows, {}, childCountMap), total: total, page: page, pageSize: pageSize } });
    } catch (e) {
      console.error('list error', e);
      return res.json({ code: 500, msg: '查询失败' });
    }
  });

  app.get('/api/listTaoRenOptions', authMiddleware, async (req, res) => {
    try {
      if (req.user && req.user.role === '医助') {
        return res.json({ code: 200, data: [] });
      }

      let sql = "SELECT DISTINCT taoRen AS name FROM clues WHERE COALESCE(taoRen,'') <> '' AND COALESCE(revisitGroupId,'') = ''";
      const params = [];

      if (req.user.role === '咨询') {
        sql += ` AND ${buildConsultAssigneeExpr('clues')} = ?`;
        params.push(req.user.username);
      } else if (req.user.role === '套电') {
        sql += ' AND username = ?';
        params.push(req.user.username);
      } else if (!(req.user.role === '主管' || req.user.role === '超级管理员' || req.user.role === '套电' || req.user.role === '运营' || req.user.role === '数据')) {
        sql += ' AND username = ?';
        params.push(req.user.username);
      }

      sql += ' ORDER BY taoRen ASC';
      const rows = await query(sql, params);
      return res.json({ code: 200, data: rows || [] });
    } catch (e) {
      console.error('listTaoRenOptions error', e);
      return res.json({ code: 500, msg: '查询失败' });
    }
  });

  app.get('/api/expiredCount', authMiddleware, async (req, res) => {
    try {
      const hasExpired = await ensureExpiredColumnFlag();
      const sql = `SELECT COUNT(*) AS c FROM clues c WHERE ${buildExpiredRuleExpr('c', hasExpired)}`;
      const rows = await query(sql);
      const count = rows && rows[0] && (rows[0].c || rows[0].c === 0) ? Number(rows[0].c) : 0;
      return res.json({ code: 200, data: { count: count } });
    } catch (e) {
      console.error('expiredCount error', e);
      return res.json({ code: 500, msg: '统计失败' });
    }
  });

  app.post('/api/publicPoolList', authMiddleware, async (req, res) => {
    try {
      const body = req.body || {};
      const hasExpired = await ensureExpiredColumnFlag();
      if (req.user.role === '医助') return res.json({ code: 200, data: { rows: [], total: 0, page: 1, pageSize: 20 } });

      let sql =
        "SELECT clues.*, (SELECT user FROM visits WHERE clueId = clues.id ORDER BY time ASC LIMIT 1) AS firstVisitUser FROM clues WHERE 1=1";
      const params = [];
      const page = parseInt(body.page, 10) || 1;
      const pageSize = parseInt(body.pageSize, 10) || 20;

      sql += " AND (COALESCE(revisitGroupId, '') = '')";
      sql += ` AND ${buildExpiredRuleExpr('clues', hasExpired)}`;

      if (body.id) {
        sql += ' AND CAST(id AS CHAR) LIKE ?';
        params.push('%' + body.id + '%');
      }
      if (body.channel) {
        sql += ' AND channel = ?';
        params.push(body.channel);
      }
      if (body.doctor) {
        sql += ' AND doctor = ?';
        params.push(body.doctor);
      }
      if (body.regDoctor) {
        sql += ' AND COALESCE(NULLIF(regDoctor,\'\'), doctor) = ?';
        params.push(body.regDoctor);
      }
      if (body.assignedTo) {
        sql += ` AND ${buildConsultAssigneeExpr('clues')} = ?`;
        params.push(body.assignedTo);
      }
      if (body.name) {
        sql += ' AND name LIKE ?';
        params.push('%' + body.name + '%');
      }
      if (body.phone) {
        sql += ' AND phone LIKE ?';
        params.push('%' + body.phone + '%');
      }
      if (body.wechat) {
        sql += ' AND wechat LIKE ?';
        params.push('%' + body.wechat + '%');
      }
      if (body.startDate) {
        sql += ' AND createTime >= ?';
        params.push(body.startDate + ' 00:00:00');
      }
      if (body.endDate) {
        sql += ' AND createTime <= ?';
        params.push(body.endDate + ' 23:59:59');
      }
      sql = appendTypedTimeRangeFilter(sql, params, body, 'clues');
      if (body.expiredReasonType === 'invalid') {
        sql += " AND COALESCE(intent, '') = '无效'";
      } else if (body.expiredReasonType === 'system') {
        sql += " AND COALESCE(intent, '') <> '无效'";
      }

      if (req.user.role === '咨询') {
        sql += ` AND ${buildConsultAssigneeExpr('clues')} = ?`;
        params.push(req.user.username);
      } else if (req.user.role === '套电') {
        sql += ' AND username = ?';
        params.push(req.user.username);
      } else if (!(req.user.role === '主管' || req.user.role === '超级管理员' || req.user.role === '套电' || req.user.role === '运营' || req.user.role === '数据')) {
        sql += ' AND username = ?';
        params.push(req.user.username);
      }

      sql += ' ORDER BY createTime DESC';

      const countSql = sql.replace(/SELECT[\s\S]*?FROM\s+clues/i, 'SELECT COUNT(*) as cnt FROM clues');
      const countRows = await query(countSql, params);
      const total = countRows && countRows[0] && countRows[0].cnt ? Number(countRows[0].cnt) : 0;

      const offset = (Math.max(1, page) - 1) * pageSize;
      const pagedSql = sql + ' LIMIT ? OFFSET ?';
      const pagedParams = params.slice();
      pagedParams.push(pageSize, offset);
      const rows = await query(pagedSql, pagedParams);

      const childCountMap = {};
      try {
        const childRows = await query("SELECT parentClueId, COUNT(*) as c FROM clues WHERE parentClueId IS NOT NULL AND parentClueId <> '' GROUP BY parentClueId");
        for (const row of childRows || []) {
          if (row && row.parentClueId) childCountMap[String(row.parentClueId)] = Number(row.c) || 0;
        }
      } catch (e) {
        console.warn('build childCount map failed', e);
      }

      try {
        const ids = (rows || []).map((r) => r && r.id).filter(Boolean);
        const visitStatsMap = await buildVisitStatsMap(ids);
        const outRows = enrichRows(rows, visitStatsMap, childCountMap);
        return res.json({ code: 200, data: { rows: outRows, total: total, page: page, pageSize: pageSize } });
      } catch (e) {
        console.warn('normalize visitStatus for publicPoolList failed', e);
      }
      return res.json({ code: 200, data: { rows: enrichRows(rows, {}, childCountMap), total: total, page: page, pageSize: pageSize } });
    } catch (e) {
      console.error('publicPoolList error', e);
      return res.json({ code: 500, msg: '查询失败' });
    }
  });

  app.get('/api/bookList', authMiddleware, async (req, res) => {
    try {
      const params = [];
      let sql =
        "SELECT clues.*, (SELECT user FROM visits WHERE clueId = clues.id ORDER BY time ASC LIMIT 1) AS firstVisitUser FROM clues WHERE book = '已预约'";
      if (req.query && req.query.id) {
        sql += ' AND id = ?';
        params.push(req.query.id);
      }
      if (req.query && req.query.month && /^\d{4}-\d{2}$/.test(req.query.month)) {
        const parts = req.query.month.split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (Number.isFinite(y) && Number.isFinite(m)) {
          const start = `${y}-${m < 10 ? '0' + m : m}-01 00:00:00`;
          const em = m === 12 ? `${y + 1}-01-01 00:00:00` : `${y}-${m + 1 < 10 ? '0' + (m + 1) : m + 1}-01 00:00:00`;
          sql += ' AND (COALESCE(visitDate, createTime) >= ? AND COALESCE(visitDate, createTime) < ? )';
          params.push(start, em);
        }
      }
      if (req.query && req.query.bookUser) {
        sql += ' AND bookUser = ?';
        params.push(req.query.bookUser);
      }
      if (req.query && req.query.quickFilter === 'todayBooked') {
        sql += " AND bookTime IS NOT NULL AND bookTime <> '' AND DATE(bookTime)=CURDATE()";
      }
      if (req.query && req.query.quickFilter === 'todayArrived') {
        sql += " AND visitDate IS NOT NULL AND visitDate <> '' AND DATE(visitDate)=CURDATE()";
      }
      if (req.user.role === '咨询') {
        sql += ` AND ${buildConsultAssigneeExpr('clues')} = ?`;
        params.push(req.user.username);
      } else if (req.user.role === '套电') {
        sql += ' AND username = ?';
        params.push(req.user.username);
      } else if (!(req.user.role === '主管' || req.user.role === '超级管理员' || req.user.role === '咨询' || req.user.role === '套电' || req.user.role === '医助' || req.user.role === '运营' || req.user.role === '数据')) {
        sql += ' AND username = ?';
        params.push(req.user.username);
      }
      sql += ' ORDER BY createTime DESC';
      const rows = await query(sql, params);

      const childCountMap = {};
      try {
        const childRows = await query("SELECT parentClueId, COUNT(*) as c FROM clues WHERE parentClueId IS NOT NULL AND parentClueId <> '' GROUP BY parentClueId");
        for (const row of childRows || []) {
          if (row && row.parentClueId) childCountMap[String(row.parentClueId)] = Number(row.c) || 0;
        }
      } catch (e) {
        console.warn('build childCount map failed', e);
      }

      try {
        const ids = (rows || []).map((r) => r && r.id).filter(Boolean);
        const visitStatsMap = await buildVisitStatsMap(ids);
        const out = enrichRows(rows, visitStatsMap, childCountMap, { useIntentAsVisitCount: true }).map((r) =>
          Object.assign({}, r, { visitType: r.revisitGroupId ? '复诊' : '初诊' })
        );
        return res.json({ code: 200, data: out });
      } catch (e) {
        console.warn('normalize visitStatus for bookList failed', e);
      }
      return res.json({ code: 200, data: enrichRows(rows, {}, childCountMap, { useIntentAsVisitCount: true }).map((r) => Object.assign({}, r, { visitType: r.revisitGroupId ? '复诊' : '初诊' })) });
    } catch (e) {
      console.error('bookList error', e);
      return res.json({ code: 500, msg: '查询失败' });
    }
  });
}

module.exports = {
  registerCluesQueryRoutes,
};
