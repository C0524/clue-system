(function (global) {
  function ensureHttp() {
    return global.ClueHttpClient && typeof global.ClueHttpClient.request === 'function';
  }

  async function serverVersion(vm) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/server-version?_=' + Date.now(), { cache: 'no-store' });
  }

  global.ClueSystemApi = {
    serverVersion: serverVersion,
  };
})(window);
