const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const userModel = require('../models/user');
const { JWT_SECRET } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

router.post('/register', asyncHandler(async (req, res) => {
  const { username, password, groups } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const user = await userModel.createUser({ username, password, groups });
  return res.status(201).json(user);
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const user = userModel.findByUsername(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await userModel.verifyPassword(user, password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const payload = { id: user.id, username: user.username, groups: user.groups || [] };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
  return res.json({ token, user: payload });
}));

module.exports = router;
