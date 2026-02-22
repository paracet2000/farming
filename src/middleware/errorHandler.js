const logger = require('../lib/logger');

function errorHandler(err, req, res, next) {
  const activeLogger = req?.log || logger;
  const status = err && err.status ? err.status : 500;
  const isServerError = status >= 500;
  const requestId = req?.id || null;

  activeLogger.error(
    {
      requestId,
      err,
      status,
      method: req?.method,
      url: req?.originalUrl,
      userId: req?.user?.id || req?.user?._id || null
    },
    'Unhandled request error'
  );

  const message = isServerError ? 'Internal Server Error' : err && err.message ? err.message : 'Error';
  const details = isServerError ? (requestId ? { requestId } : null) : err && err.details ? err.details : null;

  res.status(status);
  if (typeof res.fail === 'function') {
    res.fail(status, message, details);
  } else {
    res.json({ success: false, error: { message, details } });
  }
}

module.exports = errorHandler;
