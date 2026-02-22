const express = require('express');
const router = express.Router();
const automationController = require('../controllers/automation.controller');
const { authRequired } = require('../middleware/auth');

router.get('/schedules', authRequired, automationController.listSchedules);
router.post('/schedules', authRequired, automationController.createSchedule);
router.patch('/schedules/:scheduleId', authRequired, automationController.updateSchedule);
router.patch('/schedules/:scheduleId/inactive', authRequired, automationController.deactivateSchedule);

router.post('/schedules/:scheduleId/trigger', authRequired, automationController.triggerSchedule);
router.get('/executions', authRequired, automationController.listExecutions);
router.get('/devices/:deviceId/schedules/poll', authRequired, automationController.pollDeviceSchedules);

module.exports = router;
