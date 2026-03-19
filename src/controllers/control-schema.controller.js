const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');

function requesterIdOf(req) {
  return String(req?.user?.userId || '');
}

function normalizeString(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str || null;
}

function normalizeInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isInteger(num)) return null;
  return num;
}

async function ownedDeviceOr404(deviceId, requesterId, res) {
  const device = await prisma.device.findFirst({
    where: { deviceId, createdBy: requesterId },
    select: { deviceId: true }
  });
  if (!device) {
    res.status(404).json({ error: { message: 'Device not found' } });
    return null;
  }
  return device;
}

exports.listControlSchema = asyncHandler(async (req, res) => {
  const requesterId = requesterIdOf(req);
  if (!requesterId) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  const deviceId = normalizeString(req.query.deviceId);
  if (!deviceId) {
    return res.status(400).json({ error: { message: 'deviceId is required' } });
  }

  const device = await ownedDeviceOr404(deviceId, requesterId, res);
  if (!device) return;

  const rows = await prisma.controlSchema.findMany({
    where: { deviceId: device.deviceId },
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }]
  });

  return res.json(rows);
});

exports.createControlSchema = asyncHandler(async (req, res) => {
  const requesterId = requesterIdOf(req);
  if (!requesterId) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  const deviceId = normalizeString(req.body?.deviceId);
  const type = normalizeString(req.body?.type);
  const label = normalizeString(req.body?.label);

  if (!deviceId || !type || !label) {
    return res.status(400).json({ error: { message: 'deviceId, type, and label are required' } });
  }

  const device = await ownedDeviceOr404(deviceId, requesterId, res);
  if (!device) return;

  const orderIndex = normalizeInteger(req.body?.orderIndex) || 0;
  const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : true;
  const meta = req.body?.meta ?? null;

  const created = await prisma.controlSchema.create({
    data: {
      deviceId: device.deviceId,
      type,
      label,
      orderIndex,
      isActive,
      meta
    }
  });

  return res.status(201).json(created);
});

exports.updateControlSchema = asyncHandler(async (req, res) => {
  const requesterId = requesterIdOf(req);
  if (!requesterId) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  const schemaId = normalizeString(req.params.id);
  if (!schemaId) {
    return res.status(400).json({ error: { message: 'schemaId is required' } });
  }

  const schema = await prisma.controlSchema.findUnique({
    where: { schemaId },
    select: { schemaId: true, deviceId: true }
  });
  if (!schema) {
    return res.status(404).json({ error: { message: 'Control schema not found' } });
  }

  const device = await ownedDeviceOr404(schema.deviceId, requesterId, res);
  if (!device) return;

  const data = {};
  if (req.body?.label !== undefined) data.label = normalizeString(req.body.label) || '';
  if (req.body?.orderIndex !== undefined) data.orderIndex = normalizeInteger(req.body.orderIndex) || 0;
  if (req.body?.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
  if (req.body?.meta !== undefined) data.meta = req.body.meta;

  const updated = await prisma.controlSchema.update({
    where: { schemaId },
    data
  });

  return res.json(updated);
});

exports.deleteControlSchema = asyncHandler(async (req, res) => {
  const requesterId = requesterIdOf(req);
  if (!requesterId) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  const schemaId = normalizeString(req.params.id);
  if (!schemaId) {
    return res.status(400).json({ error: { message: 'schemaId is required' } });
  }

  const schema = await prisma.controlSchema.findUnique({
    where: { schemaId },
    select: { schemaId: true, deviceId: true }
  });
  if (!schema) {
    return res.status(404).json({ error: { message: 'Control schema not found' } });
  }

  const device = await ownedDeviceOr404(schema.deviceId, requesterId, res);
  if (!device) return;

  await prisma.controlSchema.delete({ where: { schemaId } });
  return res.json({ message: 'Deleted' });
});
