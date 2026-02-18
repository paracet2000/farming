function errorHandler(err, req, res, next) {
  // simple centralized error handler that uses res.fail when available
  // log the error (could be enhanced to use a logger)
  console.error(err && err.stack ? err.stack : err);
  const status = err && err.status ? err.status : 500;
  res.status(status);
  if (typeof res.fail === 'function') {
    res.fail(status, err && err.message ? err.message : 'Internal Server Error', err && err.details ? err.details : null);
  } else {
    res.json({ success: false, error: { message: err && err.message ? err.message : 'Internal Server Error', details: err && err.details ? err.details : null } });
  }
}

module.exports = errorHandler;
