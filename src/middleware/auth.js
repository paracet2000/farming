const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('securities key is not defined in environment variables');
}

function toAuthUser(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return {
    userId: user.userId,
    displayName: user.displayName,
    email: user.email,
    roles,
    groups: roles,
    status: user.status
  };
}

function readBearerToken(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  return h.slice(7);
}

async function authRequired(req, res, next) {
  const token = readBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload?.type && payload.type !== 'user') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const tokenUserId = String(payload?.userId || '');
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
    req.auth = { type: 'user', userId: user.userId };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

async function deviceAuthRequired(req, res, next) {
  const token = readBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload?.type !== 'device') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const tokenDeviceId = String(payload?.deviceId || '');
    if (!tokenDeviceId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const device = await prisma.device.findUnique({
      where: { deviceId: tokenDeviceId },
      select: {
        deviceId: true,
        deviceName: true,
        createdBy: true,
        isActive: true
      }
    });

    if (!device) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (!device.isActive) {
      return res.status(403).json({ error: 'Device is inactive' });
    }

    req.device = {
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      createdBy: device.createdBy || null,
      isActive: device.isActive
    };
    req.auth = { type: 'device', deviceId: device.deviceId };
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

module.exports = { authRequired, deviceAuthRequired, allowGroups, JWT_SECRET };
