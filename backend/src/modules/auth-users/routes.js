const bcrypt = require('bcryptjs');

function registerAuthUsersRoutes(deps) {
  const app = deps.app;
  const query = deps.query;
  const execute = deps.execute;
  const addLog = deps.addLog;
  const createAuthToken = deps.createAuthToken;
  const authMiddleware = deps.authMiddleware;
  const adminOnly = deps.adminOnly;

  app.post('/api/login', async (req, res) => {
    try {
      const body = req.body || {};
      const username = body.username;
      const password = body.password;
      if (!username || !password) return res.json({ code: 400, msg: '用户名或密码为空' });
      const rows = await query('SELECT username,password,role FROM users WHERE username = ?', [username]);
      const user = rows[0];
      if (!user || !bcrypt.compareSync(password, user.password)) return res.json({ code: 400, msg: '用户名或密码错误' });
      const auth = createAuthToken(user.username);
      return res.json({ code: 200, data: { username: user.username, role: user.role, auth } });
    } catch (e) {
      console.error('login error', e);
      return res.json({ code: 500, msg: '登录失败' });
    }
  });

  app.get('/api/users', authMiddleware, adminOnly, async (req, res) => {
    try {
      const rows = await query('SELECT username,role FROM users');
      return res.json({ code: 200, data: rows });
    } catch (e) {
      console.error(e);
      return res.json({ code: 500, msg: '查询失败' });
    }
  });

  app.post('/api/addUser', authMiddleware, adminOnly, async (req, res) => {
    try {
      const body = req.body || {};
      const username = body.username;
      const password = body.password;
      const role = body.role;
      if (!username || !password || !role) return res.json({ code: 400, msg: '参数不完整' });
      const hash = bcrypt.hashSync(password, 10);
      await execute('INSERT INTO users (username,password,role) VALUES (?,?,?)', [username, hash, role]);
      await addLog(req.user.username, `添加账号：${username}`);
      return res.json({ code: 200 });
    } catch (e) {
      console.error(e);
      return res.json({ code: 500, msg: '添加失败' });
    }
  });

  app.post('/api/delUser', authMiddleware, adminOnly, async (req, res) => {
    try {
      const body = req.body || {};
      const username = body.username;
      await execute('DELETE FROM users WHERE username = ?', [username]);
      await addLog(req.user.username, `删除账号：${username}`);
      return res.json({ code: 200 });
    } catch (e) {
      console.error(e);
      return res.json({ code: 500, msg: '删除失败' });
    }
  });

  app.post('/api/changeUserPassword', authMiddleware, adminOnly, async (req, res) => {
    try {
      const body = req.body || {};
      const username = body.username;
      const newPassword = body.newPassword;
      if (!username || !newPassword) return res.json({ code: 400, msg: '参数不完整' });
      const hash = bcrypt.hashSync(newPassword, 10);
      await execute('UPDATE users SET password = ? WHERE username = ?', [hash, username]);
      await addLog(req.user.username, `修改密码：${username}`);
      return res.json({ code: 200 });
    } catch (e) {
      console.error('changeUserPassword error', e);
      return res.json({ code: 500, msg: '修改失败' });
    }
  });

  app.post('/api/updateUserRole', authMiddleware, adminOnly, async (req, res) => {
    try {
      const body = req.body || {};
      const username = body.username;
      const role = body.role;
      if (!username || !role) return res.json({ code: 400, msg: '参数不完整' });
      const allowed = ['咨询', '医助', '主管', '运营', '套电', '超级管理员', '数据'];
      if (!allowed.includes(role)) return res.json({ code: 400, msg: '非法角色' });
      await execute('UPDATE users SET role = ? WHERE username = ?', [role, username]);
      await addLog(req.user.username, `修改角色：${username} -> ${role}`);
      return res.json({ code: 200 });
    } catch (e) {
      console.error('updateUserRole error', e);
      return res.json({ code: 500, msg: '修改失败' });
    }
  });
}

module.exports = {
  registerAuthUsersRoutes,
};
