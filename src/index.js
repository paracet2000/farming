const express = require('express');
const bodyParser = require('express').json;

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const groupRoutes = require('./routes/groups');
const standardResponse = require('./middleware/standardResponse');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.use(bodyParser());
app.use(standardResponse);

app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/groups', groupRoutes);

app.get('/', (req, res) => res.json({ ok: true, service: 'farming-api' }));

// central error handler (must be after routes)
app.use(errorHandler);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on port ${port}`));
