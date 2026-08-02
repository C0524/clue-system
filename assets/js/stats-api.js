(function (global) {
  function ensureHttp() {
    return global.ClueHttpClient && typeof global.ClueHttpClient.request === 'function';
  }

  async function unvisited(vm) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/stats/unvisited');
  }

  global.ClueStatsApi = {
    unvisited: unvisited,
  };
})(window);
