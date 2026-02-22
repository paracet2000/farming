const logger = require('../lib/logger');

function errorHandler(err, req, res, next) {
  const activeLogger = req?.log || logger;
  const status = err && err.status ? err.status : 500;

  activeLogger.error(
    {
      err,
      status,
      method: req?.method,
      url: req?.originalUrl
    },
    'Unhandled request error'
  );

  res.status(status);
  if (typeof res.fail === 'function') {
    res.fail(status, err && err.message ? err.message : 'Internal Server Error', err && err.details ? err.details : null);
  } else {
    res.json({ success: false, error: { message: err && err.message ? err.message : 'Internal Server Error', details: err && err.details ? err.details : null } });
  }
}

module.exports = errorHandler;
