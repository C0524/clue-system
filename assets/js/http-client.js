(function (global) {
  async function request(vm, url, options) {
    if (global.ClueApiClient && typeof global.ClueApiClient.apiCall === 'function') {
      return global.ClueApiClient.apiCall(vm, url, options || {});
    }

    // Fallback: keep behavior predictable even if api-client fails to load.
    const opts = Object.assign({}, options || {});
    const headers = Object.assign({}, opts.headers || {});
    const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    if (!headers['Content-Type'] && !headers['content-type'] && opts.body && !isFormData) {
      headers['Content-Type'] = 'application/json';
    }
    const finalUrl = url && url.indexOf('http') === 0 ? url : ('http://localhost:3000' + (url || ''));
    const res = await fetch(finalUrl, Object.assign({}, opts, { headers: headers }));
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      return { code: 500, msg: '服务器返回无法解析的响应' };
    }
  }

  global.ClueHttpClient = {
    request: request,
  };
})(window);
