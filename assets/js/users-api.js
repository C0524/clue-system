(function (global) {
  function ensureHttp() {
    return global.ClueHttpClient && typeof global.ClueHttpClient.request === 'function';
  }

  async function listUsers(vm) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/users');
  }

  async function changeUserPassword(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/changeUserPassword', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function updateUserRole(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/updateUserRole', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function addUser(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/addUser', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async function delUser(vm, payload) {
    if (!ensureHttp()) return { code: 500, msg: 'HTTP client not ready' };
    return global.ClueHttpClient.request(vm, '/api/delUser', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  global.ClueUsersApi = {
    listUsers: listUsers,
    changeUserPassword: changeUserPassword,
    updateUserRole: updateUserRole,
    addUser: addUser,
    delUser: delUser,
  };
})(window);
