const prisma = require('../lib/prisma');
const logger = require('../lib/logger');
const { runScheduleExecution } = require('./automation.service');

const RUNNER_INTERVAL_MS = Number(process.env.AUTOMATION_RUNNER_INTERVAL_MS || 30000);

let runnerTimer = null;
let ticking = false;

function isDueNow(schedule, now) {
  if (!schedule || !schedule.isActive) return false;
  if (schedule.hour !== now.getHours()) return false;
  if (schedule.minute !== now.getMinutes()) return false;

  const days = Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [];
  if (!days.length) return true;
  return days.includes(now.getDay());
}

async function tickAutomationRunner() {
  if (ticking) return;
  ticking = true;

  try {
    const now = new Date();
    const schedules = await prisma.automationSchedule.findMany({
      where: { isActive: true }
    });

    const dueSchedules = schedules.filter((schedule) => isDueNow(schedule, now));
    if (!dueSchedules.length) return;

    const minuteBucket = Math.floor(now.getTime() / 60000);
    for (const schedule of dueSchedules) {
      const executionKey = `${schedule.scheduleId}:${minuteBucket}`;
      const result = await runScheduleExecution({
        schedule,
        triggerSource: 'SCHEDULE',
        requestedBy: null,
        executionKey
      });

      if (result.skipped) {
        logger.debug(
          { scheduleId: schedule.scheduleId, executionKey },
          'Skip duplicated schedule execution'
        );
      }
    }
  } catch (err) {
    logger.error({ err }, 'Automation runner tick failed');
  } finally {
    ticking = false;
  }
}

function startAutomationRunner() {
  if (runnerTimer) return;

  runnerTimer = setInterval(() => {
    void tickAutomationRunner();
  }, RUNNER_INTERVAL_MS);

  if (typeof runnerTimer.unref === 'function') {
    runnerTimer.unref();
  }

  logger.info({ intervalMs: RUNNER_INTERVAL_MS }, 'Automation runner started');
  void tickAutomationRunner();
}

function stopAutomationRunner() {
  if (!runnerTimer) return;
  clearInterval(runnerTimer);
  runnerTimer = null;
}

module.exports = {
  startAutomationRunner,
  stopAutomationRunner,
  tickAutomationRunner
};
