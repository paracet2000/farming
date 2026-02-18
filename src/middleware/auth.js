const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function authRequired(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  const token = h.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function allowGroups(...groups) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const userGroups = Array.isArray(req.user.groups) ? req.user.groups : [];
    const ok = groups.some(g => userGroups.includes(g));
    if (ok) return next();
    return res.status(403).json({ error: 'Forbidden' });
  };
}

module.exports = { authRequired, allowGroups, JWT_SECRET };
