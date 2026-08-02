(function (global) {
  function normalizeRole(role) {
    const r = (role || '').toString().trim();
    return r === '客服' ? '咨询' : r;
  }

  function persistSession(user) {
    try {
      localStorage.setItem('user', JSON.stringify(user || {}));
      localStorage.setItem('lastActiveAt', String(Date.now()));
    } catch (_) {}
  }

  async function login(vm) {
    if (!vm.loginUser || !vm.loginPwd) {
      vm.loginError = '用户名和密码不能为空';
      return;
    }
    const data = await vm.apiCall('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: vm.loginUser, password: vm.loginPwd }),
    });
    if (data.code === 200) {
      vm.isLogin = true;
      vm.user = { username: data.data.username, role: normalizeRole(data.data.role), auth: data.data.auth };
      persistSession(vm.user);
      try {
        if (vm.onSessionLogin && typeof vm.onSessionLogin === 'function') vm.onSessionLogin();
      } catch (_) {}
      vm.loginError = '';
      vm.getDoctors();
    } else {
      vm.loginError =
        data.msg === '网络错误'
          ? '网络错误，请检查本地服务是否启动并且浏览器已允许本地网络请求'
          : data.msg || '登录失败';
    }
  }

  function logout(vm) {
    vm.isLogin = false;
    vm.user = {};
    try {
      localStorage.removeItem('user');
      localStorage.removeItem('lastActiveAt');
    } catch (_) {}
    vm.showDetail = false;
  }

  function restoreSession(vm) {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return false;
      const parsed = JSON.parse(raw || '{}');
      if (!parsed || !parsed.username || !parsed.auth) return false;
      vm.isLogin = true;
      vm.user = { username: parsed.username, role: normalizeRole(parsed.role), auth: parsed.auth };
      try {
        localStorage.setItem('lastActiveAt', String(Date.now()));
      } catch (_) {}
      try {
        if (vm.onSessionLogin && typeof vm.onSessionLogin === 'function') vm.onSessionLogin();
      } catch (_) {}
      return true;
    } catch (_) {
      return false;
    }
  }

  global.ClueAuthClient = {
    login: login,
    logout: logout,
    restoreSession: restoreSession,
  };
})(window);
