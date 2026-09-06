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

  async function exportClues(vm, payloadOrIds) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    const bodyPayload = Array.isArray(payloadOrIds)
      ? { ids: payloadOrIds }
      : (payloadOrIds || {});
    return global.ClueHttpClient.request(vm, '/api/exportClues', {
      method: 'POST',
      body: JSON.stringify(bodyPayload),
    });
  }

  function resolveBaseUrl() {
    const isRemote =
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1' &&
      window.location.hostname !== '::1' &&
      window.location.protocol !== 'file:';
    if (window.location.protocol === 'file:' || window.location.protocol === 'null') {
      return 'http://localhost:3000';
    }
    if (isRemote) return window.location.origin;
    return 'http://localhost:3000';
  }

  async function exportByVisitDate(vm, date) {
    const d = (date || '').toString().trim();
    if (!d) return { code: 400, msg: 'date is required' };

    const token = global.ClueApiClient && typeof global.ClueApiClient.getAuth === 'function'
      ? global.ClueApiClient.getAuth(vm)
      : '';
    const headers = token ? { Authorization: 'Bearer ' + token } : {};
    const url = resolveBaseUrl() + '/api/exportByVisitDate?date=' + encodeURIComponent(d);
    const resp = await fetch(url, { method: 'GET', headers: headers, mode: 'cors', targetAddressSpace: 'local' });
    if (!resp.ok) return { code: resp.status || 500, msg: 'export failed' };

    const blob = await resp.blob();
    return {
      code: 200,
      data: {
        blob: blob,
        filename: '到诊_' + d + '.xlsx',
      },
    };
  }

  async function assignClues(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/assignClues', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function listTaoRenOptions(vm) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/listTaoRenOptions');
  }

  async function saveClue(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/save', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function updateClueField(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/update', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function updateClueMany(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/updateMany', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function updateClue(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/updateClue', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function deleteClue(vm, clueId) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/del', {
      method: 'POST',
      body: JSON.stringify({ id: clueId }),
    });
  }

  global.ClueCluesApi = {
    list: list,
    publicPoolList: publicPoolList,
    bookList: bookList,
    expiredCount: expiredCount,
    exportClues: exportClues,
    exportByVisitDate: exportByVisitDate,
    assignClues: assignClues,
    listTaoRenOptions: listTaoRenOptions,
    saveClue: saveClue,
    updateClueField: updateClueField,
    updateClueMany: updateClueMany,
    updateClue: updateClue,
    deleteClue: deleteClue,
  };
})(window);
