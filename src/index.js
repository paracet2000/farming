require('dotenv').config();

const express = require('express');
const bodyParser = require('express').json;

const connectDb = require('./db');
const logger = require('./lib/logger');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const groupRoutes = require('./routes/groups');
const automationRoutes = require('./routes/automation');
const standardResponse = require('./middleware/stdResponse');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const { startAutomationRunner } = require('./services/automationRunner');

const app = express();
app.use(requestLogger);
app.use(bodyParser());
app.use(standardResponse);

app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/groups', groupRoutes);
app.use('/automation', automationRoutes);

app.get('/', (req, res) => res.json({ ok: true, service: 'farming-api' }));

// central error handler (must be after routes)
app.use(errorHandler);

const port = process.env.PORT || 3000;

async function start() {
  await connectDb();
  startAutomationRunner();
  app.listen(port, () => logger.info({ port }, 'Server listening'));
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
