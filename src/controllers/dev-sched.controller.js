const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');

function requesterIdOf(req) {
  return String(req?.user?.userId || '');
}

function normalizeInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isInteger(num)) return null;
  return num;
}

function parseCreatePayload(body) {
  const scheduleId = String(body?.scheduleId || '').trim();
  const pinNumber = normalizeInt(body?.pinNumber);
  const duration = body?.duration === undefined ? undefined : normalizeInt(body.duration);

  if (!scheduleId) return { error: 'scheduleId is required' };
  if (pinNumber === null || pinNumber < 0) return { error: 'pinNumber must be a non-negative integer' };
  if (body?.duration !== undefined && (duration === null || duration <= 0)) {
    return { error: 'duration must be a positive integer' };
  }

  return {
    data: {
      scheduleId,
      pinNumber,
      duration
    }
  };
}

function parseUpdatePayload(body) {
  const scheduleId = String(body?.scheduleId || '').trim();
  const pinNumber = normalizeInt(body?.pinNumber);
  const newPinNumber = body?.newPinNumber === undefined ? undefined : normalizeInt(body.newPinNumber);
  const duration = body?.duration === undefined ? undefined : normalizeInt(body.duration);

  if (!scheduleId) return { error: 'scheduleId is required' };
  if (pinNumber === null || pinNumber < 0) return { error: 'pinNumber must be a non-negative integer' };
  if (newPinNumber !== undefined && (newPinNumber === null || newPinNumber < 0)) {
    return { error: 'newPinNumber must be a non-negative integer' };
  }
  if (duration !== undefined && (duration === null || duration <= 0)) {
    return { error: 'duration must be a positive integer' };
  }

  return {
    data: {
      scheduleId,
      pinNumber,
      newPinNumber,
      duration
    }
  };
}

async function ensureOwnedDevice(deviceId, requesterId) {
  return prisma.device.findFirst({
    where: {
      deviceId,
      createdBy: requesterId
    },
    select: {
      deviceId: true,
      deviceName: true
    }
  });
}

async function ensureOwnedSchedule(scheduleId, requesterId) {
  return prisma.automationSchedule.findFirst({
    where: {
      scheduleId,
      createdBy: requesterId
    },
    select: {
      scheduleId: true,
      scheduleName: true,
      action: true,
      hour: true,
      minute: true,
      daysOfWeek: true,
      isActive: true
    }
  });
}

function mapResponse(item) {
  return {
    scheduleId: item.scheduleId,
    deviceId: item.deviceId,
    pinNumber: item.pinNumber,
    duration: item.duration,
    createdAt: item.createdAt,
    schedule: item.schedule
      ? {
        scheduleId: item.schedule.scheduleId,
        scheduleName: item.schedule.scheduleName,
        action: item.schedule.action,
        hour: item.schedule.hour,
        minute: item.schedule.minute,
        daysOfWeek: Array.isArray(item.schedule.daysOfWeek) ? item.schedule.daysOfWeek : [],
        isActive: Boolean(item.schedule.isActive)
      }
      : null
  };
}

exports.listDeviceSchedules = asyncHandler(async (req, res) => {
  const requesterId = requesterIdOf(req);
  if (!requesterId) return res.status(401).json({ error: { message: 'Unauthorized' } });

  const deviceId = String(req.params.deviceId || '').trim();
  if (!deviceId) return res.status(400).json({ error: { message: 'deviceId is required' } });

  const device = await ensureOwnedDevice(deviceId, requesterId);
  if (!device) return res.status(404).json({ error: { message: 'Device not found' } });

  const rows = await prisma.scheduleHardware.findMany({
    where: {
      deviceId,
      schedule: {
        createdBy: requesterId
      }
    },
    include: {
      schedule: true
    }
  });

  const result = rows
    .map(mapResponse)
    .sort((a, b) => {
      if (a.pinNumber !== b.pinNumber) return a.pinNumber - b.pinNumber;
      if (!a.schedule || !b.schedule) return 0;
      if (a.schedule.hour !== b.schedule.hour) return a.schedule.hour - b.schedule.hour;
      return a.schedule.minute - b.schedule.minute;
    });

  return res.json(result);
});

exports.createDeviceSchedule = asyncHandler(async (req, res) => {
  const requesterId = requesterIdOf(req);
  if (!requesterId) return res.status(401).json({ error: { message: 'Unauthorized' } });

  const deviceId = String(req.params.deviceId || '').trim();
  if (!deviceId) return res.status(400).json({ error: { message: 'deviceId is required' } });

  const parsed = parseCreatePayload(req.body || {});
  if (parsed.error) return res.status(400).json({ error: { message: parsed.error } });
  const { scheduleId, pinNumber, duration } = parsed.data;

  const [device, schedule] = await Promise.all([
    ensureOwnedDevice(deviceId, requesterId),
    ensureOwnedSchedule(scheduleId, requesterId)
  ]);

  if (!device) return res.status(404).json({ error: { message: 'Device not found' } });
  if (!schedule) return res.status(404).json({ error: { message: 'Schedule not found' } });

  let finalDuration = null;
  if (schedule.action === 1) {
    if (duration === undefined) {
      return res.status(400).json({ error: { message: 'duration is required when schedule action is 1' } });
    }
    finalDuration = duration;
  }

  try {
    const created = await prisma.scheduleHardware.create({
      data: {
        deviceId,
        scheduleId,
        pinNumber,
        duration: finalDuration
      },
      include: {
        schedule: true
      }
    });

    return res.status(201).json(mapResponse(created));
  } catch (err) {
    if (err && err.code === 'P2002') {
      return res.status(409).json({ error: { message: 'This schedule/pin mapping already exists for the device' } });
    }
    throw err;
  }
});

exports.updateDeviceSchedule = asyncHandler(async (req, res) => {
  const requesterId = requesterIdOf(req);
  if (!requesterId) return res.status(401).json({ error: { message: 'Unauthorized' } });

  const deviceId = String(req.params.deviceId || '').trim();
  if (!deviceId) return res.status(400).json({ error: { message: 'deviceId is required' } });

  const parsed = parseUpdatePayload(req.body || {});
  if (parsed.error) return res.status(400).json({ error: { message: parsed.error } });
  const { scheduleId, pinNumber, newPinNumber, duration } = parsed.data;

  const mapping = await prisma.scheduleHardware.findFirst({
    where: {
      deviceId,
      scheduleId,
      pinNumber,
      device: {
        createdBy: requesterId
      },
      schedule: {
        createdBy: requesterId
      }
    },
    include: {
      schedule: true
    }
  });

  if (!mapping) {
    return res.status(404).json({ error: { message: 'Mapping not found' } });
  }

  const nextPinNumber = newPinNumber === undefined ? mapping.pinNumber : newPinNumber;
  let nextDuration = mapping.duration;
  if (mapping.schedule.action === 1) {
    if (duration !== undefined) {
      nextDuration = duration;
    }
    if (nextDuration === null || nextDuration === undefined) {
      return res.status(400).json({ error: { message: 'duration is required when schedule action is 1' } });
    }
  } else {
    nextDuration = null;
  }

  try {
    const updated = await prisma.scheduleHardware.update({
      where: {
        scheduleId_deviceId_pinNumber: {
          scheduleId: mapping.scheduleId,
          deviceId: mapping.deviceId,
          pinNumber: mapping.pinNumber
        }
      },
      data: {
        pinNumber: nextPinNumber,
        duration: nextDuration
      },
      include: {
        schedule: true
      }
    });

    return res.json(mapResponse(updated));
  } catch (err) {
    if (err && err.code === 'P2002') {
      return res.status(409).json({ error: { message: 'Target pin already has this schedule mapping' } });
    }
    throw err;
  }
});

