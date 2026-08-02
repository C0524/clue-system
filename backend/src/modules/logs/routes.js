function registerLogRoutes(deps) {
  const app = deps.app;
  const query = deps.query;
  const authMiddleware = deps.authMiddleware;
  const adminOnly = deps.adminOnly;

  app.get('/api/logs', authMiddleware, adminOnly, async (req, res) => {
    try {
      const clueId = req.query && req.query.clueId;
      const startDate = req.query && req.query.startDate;
      const endDate = req.query && req.query.endDate;

      let sqlBase = ' FROM logs WHERE 1=1';
      const params = [];
      if (clueId) {
        sqlBase += ' AND text LIKE ?';
        params.push('%' + clueId + '%');
      }
      if (startDate) {
        sqlBase += ' AND time >= ?';
        params.push(startDate + ' 00:00:00');
      }
      if (endDate) {
        sqlBase += ' AND time <= ?';
        params.push(endDate + ' 23:59:59');
      }

      let page = parseInt(req.query.page, 10);
      let pageSize = parseInt(req.query.pageSize, 10);
      if (!Number.isFinite(page) || page < 1) page = 1;
      const allowedSizes = [50, 100, 200];
      if (!Number.isFinite(pageSize) || !allowedSizes.includes(pageSize)) pageSize = 50;

      const countSql = 'SELECT COUNT(*) as cnt' + sqlBase;
      const countRows = await query(countSql, params);
      const total = countRows && countRows[0] && countRows[0].cnt ? parseInt(countRows[0].cnt, 10) : 0;

      const offset = (page - 1) * pageSize;
      const rowsSql = 'SELECT time,user,text' + sqlBase + ' ORDER BY time DESC LIMIT ? OFFSET ?';
      const rowsParams = params.slice();
      rowsParams.push(pageSize, offset);
      const rows = await query(rowsSql, rowsParams);

      return res.json({ code: 200, data: { rows, total } });
    } catch (e) {
      console.error('logs query error', e);
      return res.json({ code: 500, msg: '查询失败' });
    }
  });
}

module.exports = {
  registerLogRoutes,
};
