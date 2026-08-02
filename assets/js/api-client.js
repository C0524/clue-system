(function (global) {
  function clearLocalSession(vm) {
    try {
      if (vm && vm._handlingUnauthorized) return;
      if (vm) vm._handlingUnauthorized = true;
      if (global.ClueAuthClient && typeof global.ClueAuthClient.logout === 'function' && vm) {
        global.ClueAuthClient.logout(vm);
      } else {
        try {
          localStorage.removeItem('user');
          localStorage.removeItem('lastActiveAt');
        } catch (_) {}
        if (vm) {
          vm.isLogin = false;
          vm.user = {};
          vm.showDetail = false;
        }
      }
      if (vm && vm.showMsg) {
        vm.showMsg('登录已失效，请重新登录', 'error');
      }
      if (vm) {
        vm.loginError = '登录已失效，请重新登录';
      }
    } catch (_) {}
  }

  function isUnauthorizedData(data) {
    if (!data || typeof data !== 'object') return false;
    const code = Number(data.code);
    if (code === 401) return true;
    const msg = ((data.msg || data.message || '') + '').toLowerCase();
    if (!msg) return false;
    return msg.indexOf('unauthorized') !== -1 || msg.indexOf('token') !== -1 || msg.indexOf('登录') !== -1;
  }

  function getAuth(vm) {
    try {
      if (vm && vm.user && vm.user.auth) return vm.user.auth;
    } catch (_) {}
    return '';
  }

  function getImageProxyUrl(key) {
    if (!key) return '';
    if (window.location.protocol === 'file:') return 'http://localhost:3000/api/image?key=' + encodeURIComponent(key);
    const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '::1';
    if (isLocalHost) return 'http://localhost:3000/api/image?key=' + encodeURIComponent(key);
    return window.location.origin + '/api/image?key=' + encodeURIComponent(key);
  }

  async function apiCall(vm, url, options) {
    const opts = options || {};
    try {
      const token = getAuth(vm);
      const headers = {
        ...(opts.headers || {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      };
      if (opts.body && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }

      const isRemote =
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1' &&
        window.location.hostname !== '::1' &&
        window.location.protocol !== 'file:';

      let baseUrl;
      if (window.location.protocol === 'file:' || window.location.protocol === 'null') {
        baseUrl = 'http://localhost:3000';
      } else if (isRemote) {
        baseUrl = window.location.origin;
      } else {
        baseUrl = 'http://localhost:3000';
      }

      const primaryUrl = url.startsWith('http') ? url : baseUrl + url;
      const fetchOptions = Object.assign({}, opts, { headers: headers, mode: 'cors', targetAddressSpace: 'local' });
      try {
        fetchOptions.cache = 'no-store';
      } catch (_) {}

      let res = await fetch(primaryUrl, fetchOptions);
      if (res && res.status === 401) {
        clearLocalSession(vm);
      }
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('application/json')) {
        try {
          const localUrl = url.startsWith('http') ? url : 'http://localhost:3000' + url;
          if (localUrl !== primaryUrl) {
            const fallback = await fetch(localUrl, {
              ...opts,
              headers: headers,
              mode: 'cors',
              targetAddressSpace: 'local',
            });
            const fct = (fallback.headers.get('content-type') || '').toLowerCase();
            if (fct.includes('application/json')) {
              res = fallback;
            }
          }
        } catch (fbErr) {
          console.warn('apiCall fallback failed', fbErr);
        }
      }

      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (isUnauthorizedData(data)) {
          clearLocalSession(vm);
          return data;
        }
        if (data.code !== 200) {
          if (data.code === 409 && (data.msg === 'duplicate' || data.msg === 'duplicate_phone' || data.msg === 'duplicate_wechat')) {
            return data;
          }
          if (vm && vm.showMsg) vm.showMsg(data.msg || '服务器返回错误', 'error');
          return data;
        }
        return data;
      } catch (parseErr) {
        console.error('apiCall error: response not JSON', { url: primaryUrl, status: res.status, text: text });
        if ((text || '').trim().startsWith('<')) {
          if (vm && vm.showMsg) vm.showMsg('服务器返回 HTML 错误页（可能请求被代理到错误的主机），请检查后端服务地址与 CORS 设置', 'error');
        } else {
          if (vm && vm.showMsg) vm.showMsg('服务器返回无法解析的响应', 'error');
        }
        return { code: 500 };
      }
    } catch (e) {
      console.error('apiCall error', e);
      if (vm) vm.isLoading = false;
      if (
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1' &&
        window.location.hostname !== '::1'
      ) {
        if (vm && vm.showMsg) vm.showMsg('远程访问网络错误，请检查 Cloudflare tunnel 配置或确保本地后端允许外部访问', 'error');
      } else {
        if (vm && vm.showMsg) vm.showMsg('网络错误', 'error');
      }
      return { code: 500 };
    }
  }

  global.ClueApiClient = {
    getAuth: getAuth,
    getImageProxyUrl: getImageProxyUrl,
    apiCall: apiCall,
  };
})(window);
