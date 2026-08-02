(function (global) {
  function ensureHttp() {
    return global.ClueHttpClient && typeof global.ClueHttpClient.request === 'function';
  }

  async function list(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/list', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function publicPoolList(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/publicPoolList', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function bookList(vm, queryString) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    const q = queryString || '';
    return global.ClueHttpClient.request(vm, '/api/bookList' + q);
  }

  async function expiredCount(vm) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/expiredCount');
  }

  async function exportClues(vm, ids) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/exportClues', {
      method: 'POST',
      body: JSON.stringify({ ids: Array.isArray(ids) ? ids : [] }),
    });
  }

  async function assignClues(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/assignClues', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  global.ClueCluesApi = {
    list: list,
    publicPoolList: publicPoolList,
    bookList: bookList,
    expiredCount: expiredCount,
    exportClues: exportClues,
    assignClues: assignClues,
  };
})(window);
