function registerDoctorRoutes(deps) {
  const app = deps.app;
  const query = deps.query;
  const execute = deps.execute;
  const addLog = deps.addLog;
  const authMiddleware = deps.authMiddleware;
  const adminOnly = deps.adminOnly;

  app.get('/api/doctors', async (req, res) => {
    try {
      const rows = await query('SELECT name,dept,operator FROM doctors');
      return res.json({ code: 200, data: rows });
    } catch (e) {
      console.error(e);
      return res.json({ code: 500, msg: '查询失败' });
    }
  });

  app.post('/api/addDoctor', authMiddleware, adminOnly, async (req, res) => {
    try {
      const body = req.body || {};
      const name = body.name;
      const dept = body.dept || '';
      const operator = body.operator || '';
      await execute('INSERT INTO doctors (name,dept,operator) VALUES (?,?,?)', [name, dept, operator]);
      await addLog(req.user.username, `添加医生：${name}`);
      return res.json({ code: 200 });
    } catch (e) {
      console.error(e);
      return res.json({ code: 500, msg: '添加失败' });
    }
  });

  app.post('/api/updateDoctor', authMiddleware, adminOnly, async (req, res) => {
    try {
      try {
        console.log('updateDoctor called from', req.ip || req.connection.remoteAddress, 'hostHeader=', req.headers.host, 'bodySample=', JSON.stringify(req.body).slice(0, 200));
      } catch (_) {}
      const body = req.body || {};
      const name = body.name;
      const dept = body.dept || '';
      const operator = body.operator || '';
      if (!name) return res.json({ code: 400, msg: 'name 为空' });
      await execute('UPDATE doctors SET dept = ?, operator = ? WHERE name = ?', [dept, operator, name]);
      await addLog(req.user.username, `更新医生：${name}`);
      return res.json({ code: 200 });
    } catch (e) {
      console.error('updateDoctor error', e);
      return res.json({ code: 500, msg: '更新失败' });
    }
  });

  app.post('/api/delDoctor', authMiddleware, adminOnly, async (req, res) => {
    try {
      const body = req.body || {};
      const name = body.name;
      await execute('DELETE FROM doctors WHERE name = ?', [name]);
      await addLog(req.user.username, `删除医生：${name}`);
      return res.json({ code: 200 });
    } catch (e) {
      console.error(e);
      return res.json({ code: 500, msg: '删除失败' });
    }
  });
}

module.exports = {
  registerDoctorRoutes,
};
