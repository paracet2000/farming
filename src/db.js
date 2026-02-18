const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'db.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({ users: [], groups: [] }, null, 2));

function read() {
  const raw = fs.readFileSync(dbFile, 'utf8');
  return JSON.parse(raw);
}

function write(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { read, write };
