const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const bcrypt = require('bcryptjs');

function normalizeString(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str || null;
}

function requesterIdOf(req) {
  return String(req?.user?.userId || '');
}

function toDeviceResponse(device) {
  if (!device) return null;
  return {
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    description: device.description,
    isActive: device.isActive,
    createdBy: device.createdBy,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt
  };
}

exports.listDevices = asyncHandler(async (req, res) => {
  const requesterId = requesterIdOf(req);
  if (!requesterId) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  const devices = await prisma.device.findMany({
    where: { createdBy: requesterId },
    orderBy: { createdAt: 'desc' }
  });
  return res.json(devices.map((item) => toDeviceResponse(item)));
});

exports.createDevice = asyncHandler(async (req, res) => {
  const requesterId = requesterIdOf(req);
  if (!requesterId) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  const { deviceId, deviceName } = req.body || {};
  const safeDeviceId = normalizeString(deviceId);
  const safeDeviceName = normalizeString(deviceName);
  const safeDescription = normalizeString(req?.body?.description) || '';
  const safeDeviceSecret = normalizeString(req?.body?.deviceSecret);

  if (!safeDeviceId || !safeDeviceName) {
    return res.status(400).json({ error: { message: 'deviceId and deviceName are required' } });
  }

  const exists = await prisma.device.findUnique({
    where: { deviceId: safeDeviceId }
  });
  if (exists) {
    return res.status(409).json({ error: { message: 'Device ID already exists' } });
  }

  const device = await prisma.device.create({
    data: {
      deviceId: safeDeviceId,
      deviceName: safeDeviceName,
      createdBy: requesterId,
      description: safeDescription,
      deviceSecretHash: safeDeviceSecret ? await bcrypt.hash(safeDeviceSecret, 10) : null
    }
  });

  return res.status(201).json(toDeviceResponse(device));
});

exports.getDeviceById = asyncHandler(async (req, res) => {
  const requesterId = requesterIdOf(req);
  if (!requesterId) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  const device = await prisma.device.findFirst({
    where: {
      deviceId: String(req.params.id),
      createdBy: requesterId
    }
  });

  if (!device) {
    return res.status(404).json({ error: { message: 'Not found' } });
  }

  return res.json(toDeviceResponse(device));
});

exports.updateDeviceById = asyncHandler(async (req, res) => {
  const requesterId = requesterIdOf(req);
  if (!requesterId) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  const deviceId = String(req.params.id);
  const { deviceName, isActive, description } = req.body || {};
  const safeDeviceName = normalizeString(deviceName);
  const safeDescription = normalizeString(description);
  const hasDeviceSecret = Object.prototype.hasOwnProperty.call(req.body || {}, 'deviceSecret');
  const safeDeviceSecret = normalizeString(req?.body?.deviceSecret);

  if (hasDeviceSecret && !safeDeviceSecret) {
    return res.status(400).json({ error: { message: 'deviceSecret must not be empty' } });
  }

  const device = await prisma.device.findFirst({
    where: { deviceId, createdBy: requesterId }
  });

  if (!device) {
    return res.status(404).json({ error: { message: 'Not found' } });
  }

  const data = {
    deviceName: safeDeviceName || device.deviceName,
    isActive: typeof isActive === 'boolean' ? isActive : device.isActive,
    description: safeDescription === null ? device.description : safeDescription
  };

  if (hasDeviceSecret && safeDeviceSecret) {
    data.deviceSecretHash = await bcrypt.hash(safeDeviceSecret, 10);
  }

  const updated = await prisma.device.update({
    where: { deviceId },
    data
  });

  return res.json(toDeviceResponse(updated));
});

exports.deleteDeviceById = asyncHandler(async (req, res) => {
  const requesterId = requesterIdOf(req);
  if (!requesterId) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  const deviceId = String(req.params.id);
  const device = await prisma.device.findFirst({
    where: { deviceId, createdBy: requesterId }
  });

  if (!device) {
    return res.status(404).json({ error: { message: 'Not found' } });
  }

  await prisma.device.delete({
    where: { deviceId }
  });

  return res.json({ message: 'Device deleted successfully' });
});
