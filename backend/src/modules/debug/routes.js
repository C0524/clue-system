function registerDebugRoutes(ctx){
  const app = ctx.app;
  const query = ctx.query;
  const authMiddleware = ctx.authMiddleware;
  const adminOnly = ctx.adminOnly;
  const ENABLE_DEBUG_ROUTES = ctx.ENABLE_DEBUG_ROUTES;

  // 临时调试路由：显示后端从 Authorization 头解析出的内容（仅用于排查权限问题，调试完成后应移除）
  app.get('/api/debug/whoami', authMiddleware, adminOnly, (req, res) => {
    try{
      if(!ENABLE_DEBUG_ROUTES) return res.status(404).json({ code:404, msg: 'Not Found' });
      return res.json({ code:200, data: { username: req.user.username, role: req.user.role } });
    }catch(_){
      return res.status(500).json({ code:500, msg: 'whoami error' });
    }
  });

  // 调试路由：返回线索详情、回访记录、相关日志以及后端计算的 fallbackConsultant
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
      const logs = await query('SELECT time,user,text FROM logs WHERE text LIKE ? ORDER BY time DESC LIMIT 50', ['%' + id + '%']);
      return res.json({ code:200, data: { clue, visits, logs } });
    }catch(e){
      console.error('debug clue error', e);
      return res.status(500).json({ code:500, msg: 'debug query failed' });
    }
  });
}

module.exports = {
  registerDebugRoutes,
};
