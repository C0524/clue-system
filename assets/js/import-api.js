(function (global) {
  function ensureHttp() {
    return global.ClueHttpClient && typeof global.ClueHttpClient.request === 'function';
  }

  async function importClues(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/importClues', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  global.ClueImportApi = {
    importClues: importClues,
  };
})(window);
