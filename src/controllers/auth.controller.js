const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { JWT_SECRET } = require('../middleware/auth');

const ALLOWED_ROLES = ['user', 'head', 'approver', 'hr', 'finance', 'admin'];
const BASE_LOGIN_FAIL_DELAY_MS = 5 * 1000;
const MAX_LOGIN_FAIL_DELAY_MS = 24 * 60 * 60 * 1000;

function normalizeRoles(value) {
  const source = Array.isArray(value) ? value : [];
  const roles = source
    .map((r) => String(r || '').trim().toLowerCase())
    .filter((r) => ALLOWED_ROLES.includes(r));

  return roles.length ? Array.from(new Set(roles)) : ['user'];
}

function toAuthUser(user) {
  const roles = Array.isArray(user.roles) ? user.roles : [];
  return {
    id: user.userId,
    _id: user.userId,
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    roles,
    groups: roles,
    status: user.status
  };
}

function signToken(userPayload) {
  return jwt.sign(userPayload, JWT_SECRET, { expiresIn: '1d' });
}

exports.register = asyncHandler(async (req, res) => {
  const { displayName, firstName, lastName, name, email, password, roles, groups } = req.body || {};
  const safeFirstName = String(firstName || '').trim();
  const safeLastName = String(lastName || '').trim();
  const safeDisplayName = String(displayName || name || `${safeFirstName} ${safeLastName}`).trim();

  if (!safeFirstName || !safeLastName || !email || !password) {
    return res.status(400).json({ error: { message: 'firstName, lastName, email and password are required' } });
  }
  if (!safeDisplayName) {
    return res.status(400).json({ error: { message: 'displayName is required' } });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (exists) {
    return res.status(409).json({ error: { message: 'Email already exists' } });
  }

  const nextRoles = normalizeRoles(roles !== undefined ? roles : groups);
  const hashedPassword = await bcrypt.hash(String(password), 10);

  const user = await prisma.user.create({
    data: {
      displayName: safeDisplayName,
      firstName: safeFirstName,
      lastName: safeLastName,
      email: normalizedEmail,
      password: hashedPassword,
      roles: nextRoles
    }
  });

  const payload = toAuthUser(user);
  const token = signToken(payload);

  return res.status(201).json({ token, user: payload });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: { message: 'email and password are required' } });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    return res.status(401).json({ error: { message: 'Invalid credentials' } });
  }

  const now = new Date();
  if (user.nextLogin && new Date(user.nextLogin) > now) {
    const currentDelayMs = new Date(user.nextLogin).getTime() - now.getTime();
    const nextDelayMs = Math.min(currentDelayMs * 2, MAX_LOGIN_FAIL_DELAY_MS);
    const nextLogin = new Date(now.getTime() + nextDelayMs);
    await prisma.user.update({
      where: { userId: user.userId },
      data: { nextLogin }
    });
    const retryAfterSeconds = Math.ceil(nextDelayMs / 1000);
    return res.status(429).json({
      error: {
        message: 'Too many failed login attempts. Please try again later.',
        retryAfterSeconds,
        nextLogin
      }
    });
  }

  const ok = await bcrypt.compare(String(password), user.password);
  if (!ok) {
    const previousNext = user.nextLogin ? new Date(user.nextLogin) : null;
    const previousDelayMs =
      previousNext && previousNext > now
        ? previousNext.getTime() - now.getTime()
        : 0;
    const nextDelayMs = Math.min(
      previousDelayMs > 0 ? previousDelayMs * 2 : BASE_LOGIN_FAIL_DELAY_MS,
      MAX_LOGIN_FAIL_DELAY_MS
    );
    const nextLogin = new Date(now.getTime() + nextDelayMs);

    await prisma.user.update({
      where: { userId: user.userId },
      data: { nextLogin }
    });

    const retryAfterSeconds = Math.ceil(nextDelayMs / 1000);
    return res.status(401).json({
      error: {
        message: 'Invalid credentials',
        retryAfterSeconds,
        nextLogin
      }
    });
  }

  await prisma.user.update({
    where: { userId: user.userId },
    data: {
      lastLogin: now,
      nextLogin: null
    }
  });

  const payload = toAuthUser(user);
  const token = signToken(payload);

  return res.json({ token, user: payload });
});
