(function (global) {
  function ensureHttp() {
    return global.ClueHttpClient && typeof global.ClueHttpClient.request === 'function';
  }

  async function getLogs(vm, params) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    const q = [];
    const p = params || {};
    if (p.clueId) q.push('clueId=' + encodeURIComponent(p.clueId));
    if (p.startDate) q.push('startDate=' + encodeURIComponent(p.startDate));
    if (p.endDate) q.push('endDate=' + encodeURIComponent(p.endDate));
    if (p.page) q.push('page=' + encodeURIComponent(p.page));
    if (p.pageSize) q.push('pageSize=' + encodeURIComponent(p.pageSize));
    const url = '/api/logs' + (q.length ? ('?' + q.join('&')) : '');
    return global.ClueHttpClient.request(vm, url);
  }

  global.ClueLogsApi = {
    getLogs: getLogs,
  };
})(window);
