const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('securities key is not defined in environment variables');
}

function toAuthUser(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return {
    id: user.userId,
    _id: user.userId,
    displayName: user.displayName,
    email: user.email,
    roles,
    groups: roles,
    status: user.status
  };
}

async function authRequired(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  const token = h.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const tokenUserId = String(payload?.sub || payload?.id || payload?._id || '');
    if (!tokenUserId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await prisma.user.findUnique({
      where: { userId: tokenUserId },
      select: {
        userId: true,
        displayName: true,
        email: true,
        roles: true,
        status: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = toAuthUser(user);
    req.auth = { sub: user.userId };
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
