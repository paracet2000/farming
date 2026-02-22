const pino = require('pino');

const logger = pino({
  name: 'farming-api',
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'req.body.password',
      'req.body.token',
      'req.body.refreshToken',
      'password',
      'token',
      'refreshToken',
      'res.headers["set-cookie"]'
    ],
    remove: true
  }
});

module.exports = logger;
