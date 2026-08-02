function createAuthMiddleware(deps) {
  const query = deps.query;
  const verifyAuthToken = deps.verifyAuthToken;

  function normalizeUserRole(role) {
    const raw = (role || '').toString().trim();
    if (raw === '客服') return '咨询';
    return raw;
  }

  return async function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ code: 401, msg: '未授权' });
    try {
      const tokenPart = (auth.split(' ')[1] || '').trim();
      if (!tokenPart) return res.status(401).json({ code: 401, msg: '授权信息无效' });
      const payload = verifyAuthToken(tokenPart);
      if (!payload) return res.status(401).json({ code: 401, msg: '授权信息无效或已过期' });
      const username = payload.u || '';
      if (!username) return res.status(401).json({ code: 401, msg: '授权信息无效' });

      const userRows = await query('SELECT username, role FROM users WHERE username = ? LIMIT 1', [username]);
      if (!userRows || userRows.length === 0) return res.status(401).json({ code: 401, msg: '账号不存在' });

      const role = normalizeUserRole(userRows[0].role || '');
      req.user = { username, role };

      if ((role === '运营' || role === '数据') && req.method && req.method.toUpperCase() !== 'GET') {
        const path = (req.path || req.originalUrl || '').split('?')[0];
        const allowedPostForRead = ['/api/list', '/api/publicPoolList'];
        if (!allowedPostForRead.includes(path)) {
          return res.status(403).json({ code: 403, msg: '无权限（只读账号）' });
        }
      }
      return next();
    } catch (_) {
      return res.status(401).json({ code: 401, msg: '授权信息无效' });
    }
  };
}

function adminOnly(req, res, next) {
  if (!(req.user.role === '主管' || req.user.role === '超级管理员')) {
    return res.status(403).json({ code: 403, msg: '无权限' });
  }
  return next();
}

module.exports = {
  createAuthMiddleware,
  adminOnly,
};
