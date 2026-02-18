const express = require('express');
const router = express.Router();
const groupModel = require('../models/group');
const userModel = require('../models/user');
const { authRequired } = require('../middleware/auth');

router.get('/', authRequired, (req, res) => {
  const groups = groupModel.allGroups();
  res.json(groups);
});

router.post('/', authRequired, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const g = groupModel.createGroup({ name, description });
    res.status(201).json(g);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:name/users', authRequired, (req, res) => {
  const groupName = req.params.name;
  const { userId } = req.body;
  // allow adding self or admins
  if (req.user.id !== userId && !(Array.isArray(req.user.groups) && req.user.groups.includes('admins'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const user = userModel.findById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const g = groupModel.addUserToGroup(groupName, userId);
  if (!g) return res.status(404).json({ error: 'Group not found' });
  res.json(g);
});

router.delete('/:name/users', authRequired, (req, res) => {
  const groupName = req.params.name;
  const { userId } = req.body;
  if (req.user.id !== userId && !(Array.isArray(req.user.groups) && req.user.groups.includes('admins'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const g = groupModel.removeUserFromGroup(groupName, userId);
  if (!g) return res.status(404).json({ error: 'Group not found' });
  res.json(g);
});

module.exports = router;
