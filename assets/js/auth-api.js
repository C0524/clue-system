(function (global) {
  async function login(vm, payload) {
    if (!global.ClueHttpClient || typeof global.ClueHttpClient.request !== 'function') {
      return { code: 500, msg: 'HTTP client not ready' };
    }
    return global.ClueHttpClient.request(vm, '/api/login', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  global.ClueAuthApi = {
    login: login,
  };
})(window);
