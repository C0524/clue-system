(function (global) {
  function ensureHttp() {
    return global.ClueHttpClient && typeof global.ClueHttpClient.request === 'function';
  }

  async function revisitList(vm) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/revisitList');
  }

  async function expertSchedule(vm, queryString) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/expertSchedule?' + (queryString || ''));
  }

  async function scheduleRevisit(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/scheduleRevisit', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function listVisits(vm, clueId) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/visit/' + encodeURIComponent(clueId || ''));
  }

  async function addVisit(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/visit', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function updateVisit(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/updateVisit', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function createVisit(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/createVisit', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function deleteImage(vm, imageId) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/deleteImage', {
      method: 'POST',
      body: JSON.stringify({ id: imageId }),
    });
  }

  async function clueImages(vm, clueId) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/clueImages?clueId=' + encodeURIComponent(clueId || ''));
  }

  async function associateImagesToVisit(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/associateImagesToVisit', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function uploadImage(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    const data = payload || {};
    const form = new FormData();
    form.append('image', data.file, data.filename || 'upload.jpg');

    const query = [];
    if (data.clueId) query.push('clueId=' + encodeURIComponent(data.clueId));
    if (data.visitId) query.push('visitId=' + encodeURIComponent(data.visitId));
    const url = '/api/uploadImage' + (query.length ? ('?' + query.join('&')) : '');

    return global.ClueHttpClient.request(vm, url, {
      method: 'POST',
      body: form,
    });
  }

  global.ClueVisitsApi = {
    revisitList: revisitList,
    expertSchedule: expertSchedule,
    scheduleRevisit: scheduleRevisit,
    listVisits: listVisits,
    addVisit: addVisit,
    updateVisit: updateVisit,
    createVisit: createVisit,
    deleteImage: deleteImage,
    clueImages: clueImages,
    associateImagesToVisit: associateImagesToVisit,
    uploadImage: uploadImage,
  };
})(window);
