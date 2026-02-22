const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const {
  toScheduleResponse,
  toExecutionResponse,
  toDeviceSchedulePollResponse,
  runScheduleExecution
} = require('../services/automation.service');

function normalizeInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isInteger(num)) return null;
  return num;
}

function normalizeAction(value) {
  const action = normalizeInteger(value);
  if (action === null) return null;
  if (action !== 0 && action !== 1) return null;
  return action;
}

function normalizeDaysOfWeek(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return null;

  const days = value
    .map((v) => normalizeInteger(v))
    .filter((v) => v !== null && v >= 0 && v <= 6);

  if (days.length !== value.length) return null;
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

function scheduleDataFromBody(body, { partial }) {
  const data = {};

  if (!partial || body.scheduleName !== undefined) {
    const name = String(body.scheduleName || '').trim();
    if (!name) return { error: 'scheduleName is required' };
    data.scheduleName = name;
  }

  if (!partial || body.action !== undefined) {
    const action = normalizeAction(body.action);
    if (action === null) return { error: 'action must be 0 or 1' };
    data.action = action;
  }

  if (!partial || body.hour !== undefined) {
    const hour = normalizeInteger(body.hour);
    if (hour === null || hour < 0 || hour > 23) return { error: 'hour must be integer between 0 and 23' };
    data.hour = hour;
  }

  if (!partial || body.minute !== undefined) {
    const minute = normalizeInteger(body.minute);
    if (minute === null || minute < 0 || minute > 59) return { error: 'minute must be integer between 0 and 59' };
    data.minute = minute;
  }

  if (body.daysOfWeek !== undefined) {
    const days = normalizeDaysOfWeek(body.daysOfWeek);
    if (days === null || !days.length) return { error: 'daysOfWeek must be array of integers 0-6' };
    data.daysOfWeek = days;
  }

  if (body.status !== undefined) {
    const status = String(body.status || '').trim().toUpperCase();
    if (status !== 'ACTIVE' && status !== 'INACTIVE') {
      return { error: 'status must be ACTIVE or INACTIVE' };
    }
    data.isActive = status === 'ACTIVE';
  }

  if (body.isActive !== undefined) {
    data.isActive = Boolean(body.isActive);
  }

  return { data };
}

function requesterIdOf(req) {
  return String(req?.user?.id || req?.user?._id || '');
}

function pollIntervalMs() {
  const raw = Number(process.env.ESP_POLL_INTERVAL_MS);
  if (Number.isInteger(raw) && raw > 0) return raw;
  return 3000;
}

function requireRequesterId(req, res) {
  const requesterId = requesterIdOf(req);
  if (!requesterId) {
    res.status(401).json({ error: { message: 'Unauthorized' } });
    return null;
  }
  return requesterId;
}

async function ownedScheduleIds(requesterId, specificScheduleId) {
  const schedules = await prisma.automationSchedule.findMany({
    where: {
      createdBy: requesterId,
      ...(specificScheduleId ? { scheduleId: specificScheduleId } : {})
    },
    select: { scheduleId: true }
  });

  return schedules.map((item) => item.scheduleId);
}

exports.listSchedules = asyncHandler(async (req, res) => {
  const requesterId = requireRequesterId(req, res);
  if (!requesterId) return;

  const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
  const schedules = await prisma.automationSchedule.findMany({
    where: includeInactive
      ? { createdBy: requesterId }
      : { createdBy: requesterId, isActive: true },
    orderBy: [{ hour: 'asc' }, { minute: 'asc' }, { scheduleName: 'asc' }]
  });

  return res.json(schedules.map((schedule) => toScheduleResponse(schedule)));
});

exports.createSchedule = asyncHandler(async (req, res) => {
  const requesterId = requireRequesterId(req, res);
  if (!requesterId) return;

  const body = req.body || {};
  const parsed = scheduleDataFromBody(body, { partial: false });
  if (parsed.error) {
    return res.status(400).json({ error: { message: parsed.error } });
  }

  const schedule = await prisma.automationSchedule.create({
    data: {
      ...parsed.data,
      createdBy: requesterId
    }
  });

  return res.status(201).json(toScheduleResponse(schedule));
});

exports.updateSchedule = asyncHandler(async (req, res) => {
  const requesterId = requireRequesterId(req, res);
  if (!requesterId) return;

  const body = req.body || {};
  const parsed = scheduleDataFromBody(body, { partial: true });
  if (parsed.error) {
    return res.status(400).json({ error: { message: parsed.error } });
  }

  if (!Object.keys(parsed.data).length) {
    return res.status(400).json({ error: { message: 'No valid fields to update' } });
  }

  const current = await prisma.automationSchedule.findFirst({
    where: {
      scheduleId: String(req.params.scheduleId),
      createdBy: requesterId
    }
  });

  if (!current) {
    return res.status(404).json({ error: { message: 'Schedule not found' } });
  }

  const schedule = await prisma.automationSchedule.update({
    where: { scheduleId: current.scheduleId },
    data: parsed.data
  });

  return res.json(toScheduleResponse(schedule));
});

exports.deactivateSchedule = asyncHandler(async (req, res) => {
  const requesterId = requireRequesterId(req, res);
  if (!requesterId) return;

  const current = await prisma.automationSchedule.findFirst({
    where: {
      scheduleId: String(req.params.scheduleId),
      createdBy: requesterId
    }
  });

  if (!current) {
    return res.status(404).json({ error: { message: 'Schedule not found' } });
  }

  const schedule = await prisma.automationSchedule.update({
    where: { scheduleId: current.scheduleId },
    data: { isActive: false }
  });

  return res.json(toScheduleResponse(schedule));
});

exports.triggerSchedule = asyncHandler(async (req, res) => {
  const requesterId = requireRequesterId(req, res);
  if (!requesterId) return;

  const schedule = await prisma.automationSchedule.findFirst({
    where: {
      scheduleId: String(req.params.scheduleId),
      createdBy: requesterId
    }
  });

  if (!schedule) {
    return res.status(404).json({ error: { message: 'Schedule not found' } });
  }

  const result = await runScheduleExecution({
    schedule,
    triggerSource: 'MANUAL',
    requestedBy: requesterId,
    executionKey: null
  });

  if (result.skipped) {
    return res.status(409).json({ error: { message: 'Execution skipped' } });
  }

  return res.json(toExecutionResponse(result.execution));
});

exports.listExecutions = asyncHandler(async (req, res) => {
  const requesterId = requireRequesterId(req, res);
  if (!requesterId) return;

  const scheduleId = req.query.scheduleId ? String(req.query.scheduleId) : null;
  const limitRaw = normalizeInteger(req.query.limit);
  const take = Math.min(Math.max(limitRaw || 50, 1), 200);

  const scheduleIds = await ownedScheduleIds(requesterId, scheduleId);
  if (!scheduleIds.length) {
    return res.json([]);
  }

  const executions = await prisma.automationExecutionLog.findMany({
    where: {
      scheduleId: { in: scheduleIds }
    },
    orderBy: { startedAt: 'desc' },
    take
  });

  return res.json(executions.map((item) => toExecutionResponse(item)));
});

exports.pollDeviceSchedules = asyncHandler(async (req, res) => {
  const requesterId = requireRequesterId(req, res);
  if (!requesterId) return;

  const deviceId = String(req.params.deviceId || '').trim();
  if (!deviceId) {
    return res.status(400).json({ error: { message: 'deviceId is required' } });
  }

  const device = await prisma.device.findFirst({
    where: {
      deviceId,
      createdBy: requesterId
    },
    select: {
      deviceId: true,
      deviceName: true,
      isActive: true
    }
  });

  if (!device) {
    return res.status(404).json({ error: { message: 'Device not found' } });
  }

  if (!device.isActive) {
    return res.status(409).json({ error: { message: 'Device is inactive' } });
  }

  const rows = await prisma.scheduleHardware.findMany({
    where: {
      deviceId: device.deviceId,
      schedule: {
        createdBy: requesterId,
        isActive: true
      }
    },
    include: {
      schedule: true
    }
  });

  const schedules = rows
    .map((item) => toDeviceSchedulePollResponse(item))
    .sort((a, b) => {
      if (a.hour !== b.hour) return a.hour - b.hour;
      if (a.minute !== b.minute) return a.minute - b.minute;
      return a.pinNumber - b.pinNumber;
    });

  return res.json({
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    pollIntervalMs: pollIntervalMs(),
    polledAt: new Date().toISOString(),
    schedules
  });
});
