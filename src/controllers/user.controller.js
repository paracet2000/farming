const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');

function normalizeRoles(value) {
  const allowed = new Set(['user', 'head', 'approver', 'hr', 'finance', 'admin']);
  const source = Array.isArray(value) ? value : [];
  const roles = source
    .map((r) => String(r || '').trim().toLowerCase())
    .filter((r) => allowed.has(r));
  return Array.from(new Set(roles));
}

function userIdOf(authUser) {
  if (!authUser) return '';
  return String(authUser.id || authUser._id || '');
}

function isAdmin(authUser) {
  const groups = Array.isArray(authUser?.groups) ? authUser.groups : [];
  const roles = Array.isArray(authUser?.roles) ? authUser.roles : [];
  return groups.includes('admins') || groups.includes('admin') || roles.includes('admin');
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.userId,
    empcode: user.empcode,
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    department: user.department || [],
    avatar: user.avatar,
    roles: user.roles || [],
    status: user.status,
    emailVerified: user.emailVerified,
    emailVerifiedAt: user.emailVerifiedAt,
    lastLogin: user.lastLogin,
    nextLogin: user.nextLogin,
    options: user.options,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

exports.listUsers = asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' }
  });

  return res.json(users.map((u) => sanitizeUser(u)));
});

exports.getUserById = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { userId: String(req.params.id) }
  });

  if (!user) {
    return res.status(404).json({ error: { message: 'Not found' } });
  }

  return res.json(sanitizeUser(user));
});

exports.updateUserById = asyncHandler(async (req, res) => {
  const targetId = String(req.params.id);
  const requesterId = userIdOf(req.user);
  const admin = isAdmin(req.user);

  if (!admin && requesterId !== targetId) {
    return res.status(403).json({ error: { message: 'Forbidden' } });
  }

  const body = req.body || {};
  const data = {};

  if (body.displayName !== undefined || body.name !== undefined) {
    data.displayName = String(body.displayName !== undefined ? body.displayName : body.name).trim();
  }
  if (body.firstName !== undefined) data.firstName = String(body.firstName).trim();
  if (body.lastName !== undefined) data.lastName = String(body.lastName).trim();
  if (body.phone !== undefined) data.phone = String(body.phone).trim();
  if (body.avatar !== undefined) data.avatar = String(body.avatar).trim();

  if (admin) {
    if (Array.isArray(body.department)) {
      data.department = body.department.map((v) => String(v).trim()).filter(Boolean);
    }

    if (body.status !== undefined) {
      const status = String(body.status).toUpperCase();
      if (status === 'ACTIVE' || status === 'INACTIVE') {
        data.status = status;
      }
    }

    if (body.roles !== undefined || body.groups !== undefined) {
      data.roles = normalizeRoles(body.roles !== undefined ? body.roles : body.groups);
    }

    if (body.options !== undefined || body.meta !== undefined) {
      data.options = body.options !== undefined ? body.options : body.meta;
    }
  }

  try {
    const updated = await prisma.user.update({
      where: { userId: targetId },
      data
    });

    return res.json(sanitizeUser(updated));
  } catch (err) {
    if (err && err.code === 'P2025') {
      return res.status(404).json({ error: { message: 'Not found' } });
    }
    throw err;
  }
});
