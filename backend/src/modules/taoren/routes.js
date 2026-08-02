function registerTaoRenRoutes(deps) {
  const app = deps.app;
  const query = deps.query;
  const execute = deps.execute;
  const addLog = deps.addLog;
  const authMiddleware = deps.authMiddleware;
  const adminOnly = deps.adminOnly;

  app.get('/api/taoRen', async (req, res) => {
    try {
      const rows = await query('SELECT name FROM taoren');
      return res.json({ code: 200, data: rows });
    } catch (e) {
      console.error(e);
      return res.json({ code: 500, msg: '查询失败' });
    }
  });

  app.post('/api/addTaoRen', authMiddleware, adminOnly, async (req, res) => {
    try {
      const body = req.body || {};
      const name = body.name;
      await execute('INSERT INTO taoren (name) VALUES (?)', [name]);
      await addLog(req.user.username, `添加套电人员：${name}`);
      return res.json({ code: 200 });
    } catch (e) {
      console.error(e);
      return res.json({ code: 500, msg: '添加失败' });
    }
  });

  app.post('/api/delTaoRen', authMiddleware, adminOnly, async (req, res) => {
    try {
      const body = req.body || {};
      const name = body.name;
      await execute('DELETE FROM taoren WHERE name = ?', [name]);
      await addLog(req.user.username, `删除套电人员：${name}`);
      return res.json({ code: 200 });
    } catch (e) {
      console.error(e);
      return res.json({ code: 500, msg: '删除失败' });
    }
  });
}

module.exports = {
  registerTaoRenRoutes,
};
