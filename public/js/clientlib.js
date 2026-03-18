(function clientLibModule(window, $) {
  'use strict';

  if (!$ || typeof $.ajax !== 'function') {
    throw new Error('clientLib requires jQuery with $.ajax');
  }

  var apiBase = normalizeBaseUrl(window.API_BASE || window.__API_BASE || 'http://localhost:3000');

  function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || '').replace(/\/+$/, '');
  }

  function getApiBase() {
    return apiBase;
  }

  function setApiBase(baseUrl) {
    apiBase = normalizeBaseUrl(baseUrl);
    return apiBase;
  }

  function getToken() {
    var token = localStorage.getItem('token');
    return token ? String(token).trim() : '';
  }

  function setToken(token) {
    var safeToken = String(token || '').trim();
    if (!safeToken) {
      localStorage.removeItem('token');
      return '';
    }
    localStorage.setItem('token', safeToken);
    return safeToken;
  }

  function clearAuth() {
    localStorage.removeItem('token');
  }

  function isAbsoluteUrl(path) {
    return /^https?:\/\//i.test(String(path || ''));
  }

  function appendQuery(url, query) {
    if (!query || typeof query !== 'object') return url;
    var entries = Object.entries(query).filter(function (entry) {
      return entry[1] !== undefined && entry[1] !== null && entry[1] !== '';
    });
    if (!entries.length) return url;

    var qs = entries.map(function (entry) {
      return encodeURIComponent(entry[0]) + '=' + encodeURIComponent(String(entry[1]));
    }).join('&');

    return url + (url.indexOf('?') >= 0 ? '&' : '?') + qs;
  }

  function buildUrl(path, query) {
    var safePath = String(path || '').trim();
    if (!safePath) return appendQuery(apiBase, query);
    if (isAbsoluteUrl(safePath)) return appendQuery(safePath, query);
    if (safePath.charAt(0) !== '/') safePath = '/' + safePath;
    return appendQuery(apiBase + safePath, query);
  }

  function unwrapResponse(payload) {
    if (!payload || typeof payload !== 'object') return payload;

    if (Object.prototype.hasOwnProperty.call(payload, 'success')) {
      if (payload.success) {
        return Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
      }
      var failMessage = getErrorMessage(payload);
      var failError = new Error(failMessage);
      failError.payload = payload;
      throw failError;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'data')) {
      return payload.data;
    }

    return payload;
  }

  function getErrorMessage(source) {
    if (!source) return 'Request failed';

    if (source instanceof Error && source.message) return source.message;
    if (typeof source === 'string') return source;

    var payload = source.responseJSON || source.payload || source;
    var errorPart = payload && payload.error ? payload.error : null;

    if (errorPart && typeof errorPart === 'object' && errorPart.message) return String(errorPart.message);
    if (typeof errorPart === 'string' && errorPart) return errorPart;
    if (payload && typeof payload.message === 'string' && payload.message) return payload.message;
    if (typeof source.statusText === 'string' && source.statusText) return source.statusText;

    return 'Request failed';
  }

  function normalizeError(source) {
    var message = getErrorMessage(source);
    var err = source instanceof Error ? source : new Error(message);
    err.message = message;

    if (!err.status && source && source.status) err.status = source.status;
    if (!err.payload && source && source.responseJSON) err.payload = source.responseJSON;
    if (!err.xhr && source && typeof source.status === 'number') err.xhr = source;

    return err;
  }

  async function request(options) {
    var opts = options || {};
    var method = String(opts.method || 'GET').toUpperCase();
    var path = opts.path || opts.url || '';
    if (!path) throw new Error('Request path is required');

    var headers = Object.assign({}, opts.headers || {});
    if (opts.auth !== false) {
      var token = getToken();
      if (token && !headers.Authorization) {
        headers.Authorization = 'Bearer ' + token;
      }
    }

    var ajaxOptions = {
      url: buildUrl(path, opts.query),
      method: method,
      dataType: opts.dataType || 'json',
      headers: headers
    };

    if (opts.timeoutMs) ajaxOptions.timeout = opts.timeoutMs;

    if (opts.rawBody !== undefined) {
      ajaxOptions.data = opts.rawBody;
    } else if (opts.data !== undefined) {
      if (opts.data instanceof FormData) {
        ajaxOptions.data = opts.data;
        ajaxOptions.contentType = false;
        ajaxOptions.processData = false;
      } else if (method === 'GET' || method === 'DELETE') {
        ajaxOptions.data = opts.data;
      } else {
        ajaxOptions.contentType = opts.contentType || 'application/json';
        ajaxOptions.data = typeof opts.data === 'string' ? opts.data : JSON.stringify(opts.data);
      }
    }

    if (opts.contentType === false) ajaxOptions.contentType = false;
    if (opts.processData !== undefined) ajaxOptions.processData = opts.processData;

    try {
      var response = await $.ajax(ajaxOptions);
      return opts.unwrap === false ? response : unwrapResponse(response);
    } catch (err) {
      throw normalizeError(err);
    }
  }

  function get(path, options) {
    return request(Object.assign({}, options || {}, { method: 'GET', path: path }));
  }

  function post(path, data, options) {
    return request(Object.assign({}, options || {}, { method: 'POST', path: path, data: data }));
  }

  function put(path, data, options) {
    return request(Object.assign({}, options || {}, { method: 'PUT', path: path, data: data }));
  }

  function patch(path, data, options) {
    return request(Object.assign({}, options || {}, { method: 'PATCH', path: path, data: data }));
  }

  function del(path, options) {
    return request(Object.assign({}, options || {}, { method: 'DELETE', path: path }));
  }

  function createCrud(basePath, defaults) {
    var safeBasePath = String(basePath || '').replace(/\/+$/, '');
    var baseOptions = Object.assign({}, defaults || {});

    function withId(id) {
      return safeBasePath + '/' + encodeURIComponent(String(id));
    }

    return {
      list: function (query, options) {
        return get(safeBasePath, Object.assign({}, baseOptions, options || {}, { query: query }));
      },
      get: function (id, options) {
        return get(withId(id), Object.assign({}, baseOptions, options || {}));
      },
      create: function (payload, options) {
        return post(safeBasePath, payload, Object.assign({}, baseOptions, options || {}));
      },
      update: function (id, payload, options) {
        return put(withId(id), payload, Object.assign({}, baseOptions, options || {}));
      },
      patch: function (id, payload, options) {
        return patch(withId(id), payload, Object.assign({}, baseOptions, options || {}));
      },
      remove: function (id, options) {
        return del(withId(id), Object.assign({}, baseOptions, options || {}));
      }
    };
  }

  window.clientLib = {
    getApiBase: getApiBase,
    setApiBase: setApiBase,
    buildUrl: buildUrl,
    request: request,
    get: get,
    post: post,
    put: put,
    patch: patch,
    del: del,
    remove: del,
    crud: createCrud,
    unwrapResponse: unwrapResponse,
    getErrorMessage: getErrorMessage,
    getToken: getToken,
    setToken: setToken,
    clearAuth: clearAuth
  };
})(window, window.jQuery);
