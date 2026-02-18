const express = require('express');
const router = express.Router();
const userModel = require('../models/user');
const { authRequired } = require('../middleware/auth');

function safeUser(u) {
  const { password, ...s } = u;
  return s;
}

router.get('/', authRequired, (req, res) => {
  const users = userModel.allUsers().map(u => safeUser(u));
  res.json(users);
});

router.get('/:id', authRequired, (req, res) => {
  const u = userModel.findById(req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json(safeUser(u));
});

router.put('/:id', authRequired, async (req, res) => {
  const id = req.params.id;
  // allow if self or shared group 'admins' (simple group-based admin check)
  if (req.user.id !== id && !(Array.isArray(req.user.groups) && req.user.groups.includes('admins'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const updated = userModel.updateUser(id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

module.exports = router;
