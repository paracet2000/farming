function standardResponse(req, res, next) {
  const originalJson = res.json.bind(res);

  // helper methods to send standardized responses directly
  res.success = (data, meta) => {
    originalJson({ success: true, data: data === undefined ? null : data, meta: meta || null });
  };

  res.fail = (status, message, details) => {
    res.status(status || 400);
    originalJson({ success: false, error: { message: message || 'Error', details: details || null } });
  };

  // override res.json so existing code gets wrapped
  res.json = function (payload) {
    const status = res.statusCode || 200;
    if (status >= 400) {
      let err = null;
      if (payload && typeof payload === 'object' && payload.error) err = payload.error;
      else if (typeof payload === 'string') err = { message: payload };
      else err = payload || { message: 'Error' };
      return originalJson({ success: false, error: err });
    }
    return originalJson({ success: true, data: payload === undefined ? null : payload });
  };

  next();
}

module.exports = standardResponse;
