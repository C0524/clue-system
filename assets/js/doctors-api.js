(function (global) {
  function ensureHttp() {
    return global.ClueHttpClient && typeof global.ClueHttpClient.request === 'function';
  }

  async function listDoctors(vm) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/doctors');
  }

  async function addDoctor(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/addDoctor', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function updateDoctor(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/updateDoctor', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function delDoctor(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/delDoctor', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  global.ClueDoctorsApi = {
    listDoctors: listDoctors,
    addDoctor: addDoctor,
    updateDoctor: updateDoctor,
    delDoctor: delDoctor,
  };
})(window);
