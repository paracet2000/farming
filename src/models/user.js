const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const saltRounds = 10;

function allUsers() {
  const data = db.read();
  return data.users;
}

function findByUsername(username) {
  return allUsers().find(u => u.username === username);
}

function findById(id) {
  return allUsers().find(u => u.id === id);
}

async function createUser({ username, password, groups = [] }) {
  const users = allUsers();
  if (users.find(u => u.username === username)) {
    throw new Error('Username exists');
  }
  const hash = await bcrypt.hash(password, saltRounds);
  const user = { id: uuidv4(), username, password: hash, groups };
  users.push(user);
  const data = db.read();
  data.users = users;
  db.write(data);
  const { password: _p, ...safe } = user;
  return safe;
}

async function verifyPassword(user, plain) {
  return bcrypt.compare(plain, user.password);
}

function updateUser(id, patch) {
  const data = db.read();
  const idx = data.users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  const user = data.users[idx];
  const updated = { ...user, ...patch };
  if (patch.password) {
    // hash synchronously for simplicity
    const hash = bcrypt.hashSync(patch.password, saltRounds);
    updated.password = hash;
  }
  // ensure groups array exists
  if (!Array.isArray(updated.groups)) updated.groups = user.groups || [];
  data.users[idx] = updated;
  db.write(data);
  const { password: _p, ...safe } = updated;
  return safe;
}

function removeUser(id) {
  const data = db.read();
  const idx = data.users.findIndex(u => u.id === id);
  if (idx === -1) return false;
  data.users.splice(idx, 1);
  db.write(data);
  return true;
}

module.exports = { allUsers, findByUsername, findById, createUser, verifyPassword, updateUser, removeUser };
