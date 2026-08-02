(function (global) {
  function normalizeRole(role) {
    const r = (role || '').toString().trim();
    return r === '客服' ? '咨询' : r;
  }

  function hasRole(user, role) {
    try {
      const userRole = normalizeRole(user && user.role);
      const targetRole = normalizeRole(role);
      return !!(userRole && targetRole && userRole === targetRole);
    } catch (_) {
      return false;
    }
  }

  function isManager(user) {
    return hasRole(user, '主管') || hasRole(user, '超级管理员');
  }

  function can(user, role) {
    try {
      if (!user || !user.role) return false;
      const r = normalizeRole(user.role);
      const target = normalizeRole(role);
      return r === target || r === '主管' || r === '超级管理员';
    } catch (_) {
      return false;
    }
  }

  global.CluePermissions = {
    hasRole: hasRole,
    isManager: isManager,
    can: can,
  };
})(window);
