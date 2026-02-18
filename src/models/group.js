const db = require('../db');

function allGroups() {
  const data = db.read();
  return data.groups;
}

function findByName(name) {
  return allGroups().find(g => g.name === name);
}

function createGroup({ name, description = '' }) {
  const data = db.read();
  if (!data.groups) data.groups = [];
  if (data.groups.find(g => g.name === name)) throw new Error('Group exists');
  const group = { name, description, members: [] };
  data.groups.push(group);
  db.write(data);
  return group;
}

function addUserToGroup(groupName, userId) {
  const data = db.read();
  const g = data.groups.find(x => x.name === groupName);
  if (!g) return null;
  if (!g.members.includes(userId)) g.members.push(userId);
  // also update user's groups
  const u = data.users.find(x => x.id === userId);
  if (u && !Array.isArray(u.groups)) u.groups = [];
  if (u && !u.groups.includes(groupName)) u.groups.push(groupName);
  db.write(data);
  return g;
}

function removeUserFromGroup(groupName, userId) {
  const data = db.read();
  const g = data.groups.find(x => x.name === groupName);
  if (!g) return null;
  g.members = g.members.filter(id => id !== userId);
  const u = data.users.find(x => x.id === userId);
  if (u && Array.isArray(u.groups)) u.groups = u.groups.filter(n => n !== groupName);
  db.write(data);
  return g;
}

module.exports = { allGroups, findByName, createGroup, addUserToGroup, removeUserFromGroup };
