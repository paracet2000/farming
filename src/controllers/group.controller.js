const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');

function normalizeGroupName(value) {
  return String(value || '').trim().toLowerCase();
}

function getUserId(authUser) {
  return String(authUser?.id || authUser?._id || '');
}

function isAdmin(authUser) {
  const groups = Array.isArray(authUser?.groups) ? authUser.groups : [];
  const roles = Array.isArray(authUser?.roles) ? authUser.roles : [];
  return groups.includes('admins') || groups.includes('admin') || roles.includes('admin');
}

function isPrivilegedGroup(groupName) {
  return groupName === 'admins' || groupName === 'admin';
}

function formatGroup(group) {
  return {
    groupId: group.groupId,
    groupName: group.groupName,
    description: group.description || '',
    users: Array.isArray(group.members) ? group.members.map((m) => m.userId) : [],
    createdAt: group.createdAt,
    updatedAt: group.updatedAt
  };
}

exports.listGroups = asyncHandler(async (req, res) => {
  const groups = await prisma.group.findMany({
    orderBy: { groupName: 'asc' },
    include: {
      members: {
        select: { userId: true }
      }
    }
  });

  return res.json(groups.map((g) => formatGroup(g)));
});

exports.createGroup = asyncHandler(async (req, res) => {
  const { groupName, description } = req.body || {};
  const normalizedName = normalizeGroupName(groupName);

  if (!normalizedName) {
    return res.status(400).json({ error: { message: 'name required' } });
  }

  const exists = await prisma.group.findUnique({
    where: { groupName: normalizedName }
  });

  if (exists) {
    return res.status(409).json({ error: { message: 'Group already exists' } });
  }

  const group = await prisma.group.create({
    data: {
      groupName: normalizedName,
      description: String(description || '').trim()
    },
    include: {
      members: {
        select: { userId: true }
      }
    }
  });

  return res.status(201).json(formatGroup(group));
});

exports.addUserToGroup = asyncHandler(async (req, res) => {
  const groupName = normalizeGroupName(req.params.groupName);
  const { userId } = req.body || {};

  if (!groupName || !userId) {
    return res.status(400).json({ error: { message: 'group name and userId are required' } });
  }

  const targetUserId = String(userId);
  const requesterId = getUserId(req.user);
  const requesterIsAdmin = isAdmin(req.user);
  const isSelf = requesterId === targetUserId;

  if (!requesterIsAdmin && !isSelf) {
    return res.status(403).json({ error: { message: 'Forbidden' } });
  }

  // Prevent privilege escalation via self-join to privileged groups.
  if (!requesterIsAdmin && isPrivilegedGroup(groupName)) {
    return res.status(403).json({ error: { message: 'Only admin can manage privileged groups' } });
  }

  const [group, user] = await Promise.all([
    prisma.group.findUnique({ where: { groupName: groupName } }),
    prisma.user.findUnique({ where: { userId: targetUserId } })
  ]);

  if (!group) {
    return res.status(404).json({ error: { message: 'Group not found' } });
  }

  if (!user) {
    return res.status(404).json({ error: { message: 'User not found' } });
  }

  await prisma.groupMember.upsert({
    where: {
      groupId_userId: {
        groupId: group.groupId,
        userId: user.userId
      }
    },
    create: {
      groupId: group.groupId,
      userId: user.userId
    },
    update: {}
  });

  if (group.groupName === 'admins' && !(user.roles || []).includes('admin')) {
    await prisma.user.update({
      where: { userId: user.userId },
      data: {
        roles: Array.from(new Set([...(user.roles || []), 'admin']))
      }
    });
  }

  const refreshed = await prisma.group.findUnique({
    where: { groupId: group.groupId },
    include: {
      members: {
        select: { userId: true }
      }
    }
  });

  if (!refreshed) {
    return res.status(404).json({ error: { message: 'Group not found' } });
  }

  return res.json(formatGroup(refreshed));
});

exports.removeUserFromGroup = asyncHandler(async (req, res) => {
  const groupName = normalizeGroupName(req.params.groupName);
  const { userId } = req.body || {};

  if (!groupName || !userId) {
    return res.status(400).json({ error: { message: 'group name and userId are required' } });
  }

  const requesterId = getUserId(req.user);
  if (!isAdmin(req.user) && requesterId !== String(userId)) {
    return res.status(403).json({ error: { message: 'Forbidden' } });
  }

  const group = await prisma.group.findUnique({ where: { groupName: groupName } });
  if (!group) {
    return res.status(404).json({ error: { message: 'Group not found' } });
  }

  await prisma.groupMember.deleteMany({
    where: {
      groupId: group.groupId,
      userId: String(userId)
    }
  });

  if (group.groupName === 'admins') {
    const user = await prisma.user.findUnique({ where: { userId: String(userId) } });
    if (user) {
      const nextRoles = (user.roles || []).filter((r) => r !== 'admin');
      await prisma.user.update({
        where: { userId: user.userId },
        data: {
          roles: nextRoles.length ? nextRoles : ['user']
        }
      });
    }
  }

  const refreshed = await prisma.group.findUnique({
    where: { groupId: group.groupId },
    include: {
      members: {
        select: { userId: true }
      }
    }
  });

  if (!refreshed) {
    return res.status(404).json({ error: { message: 'Group not found' } });
  }

  return res.json(formatGroup(refreshed));
});
