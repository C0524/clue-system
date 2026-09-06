(function (global) {
  function ensureHttp() {
    return global.ClueHttpClient && typeof global.ClueHttpClient.request === 'function';
  }

  async function unvisited(vm) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/stats/unvisited');
  }

  async function statAll(vm, options) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    const opts = options || {};
    const parts = [];
    if (opts.month) parts.push('month=' + encodeURIComponent(opts.month));
    if (opts.excludeAdminImported) parts.push('excludeAdminImported=1');
    const qs = parts.length ? ('?' + parts.join('&')) : '';
    return global.ClueHttpClient.request(vm, '/api/statAll' + qs);
  }

  global.ClueStatsApi = {
    unvisited: unvisited,
    statAll: statAll,
  };
})(window);
