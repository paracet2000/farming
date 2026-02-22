const prisma = require('../lib/prisma');
const logger = require('../lib/logger');

function toScheduleResponse(schedule) {
  const isActive = Boolean(schedule.isActive);
  return {
    scheduleId: schedule.scheduleId,
    scheduleName: schedule.scheduleName,
    action: schedule.action,
    hour: schedule.hour,
    minute: schedule.minute,
    daysOfWeek: Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [],
    status: isActive ? 'ACTIVE' : 'INACTIVE',
    isActive,
    createdBy: schedule.createdBy || null,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt
  };
}

function toExecutionResponse(execution) {
  return {
    executionId: execution.executionId,
    scheduleId: execution.scheduleId || null,
    triggerSource: execution.triggerSource,
    action: execution.action,
    status: execution.status,
    requestedBy: execution.requestedBy || null,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt || null,
    resultMessage: execution.resultMessage || null
  };
}

function toDeviceSchedulePollResponse(item) {
  const schedule = item.schedule;
  const payload = {
    scheduleId: item.scheduleId,
    scheduleName: schedule.scheduleName,
    action: schedule.action,
    hour: schedule.hour,
    minute: schedule.minute,
    daysOfWeek: Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [],
    pinNumber: item.pinNumber,
    isActive: Boolean(schedule.isActive)
  };

  if (schedule.action === 1) {
    payload.duration = item.duration;
  }

  return payload;
}

async function dispatchAction(schedule) {
  logger.info(
    {
      scheduleId: schedule.scheduleId,
      action: schedule.action
    },
    'Automation action dispatched'
  );

  return `Action ${schedule.action} dispatched`;
}

async function runScheduleExecution({ schedule, triggerSource, requestedBy, executionKey }) {
  let execution;

  try {
    execution = await prisma.automationExecutionLog.create({
      data: {
        scheduleId: schedule.scheduleId,
        triggerSource,
        action: schedule.action,
        status: 'RUNNING',
        executionKey: executionKey || null,
        requestedBy: requestedBy || null
      }
    });
  } catch (err) {
    if (executionKey && err && err.code === 'P2002') {
      return { skipped: true, reason: 'already-executed' };
    }
    throw err;
  }

  try {
    const resultMessage = await dispatchAction(schedule);
    const updated = await prisma.automationExecutionLog.update({
      where: { executionId: execution.executionId },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        resultMessage
      }
    });

    return { skipped: false, execution: updated };
  } catch (err) {
    const message = err && err.message ? err.message : 'Action execution failed';
    const failed = await prisma.automationExecutionLog.update({
      where: { executionId: execution.executionId },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        resultMessage: message
      }
    });

    return { skipped: false, execution: failed };
  }
}

module.exports = {
  toScheduleResponse,
  toExecutionResponse,
  toDeviceSchedulePollResponse,
  runScheduleExecution
};
