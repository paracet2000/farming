const express = require('express');
const router = express.Router();
const mapController = require('../controllers/dev-sched.controller.js');
const { authRequired } = require('../middleware/auth');

router.get('/:deviceId/schedule', authRequired, mapController.listDeviceSchedules);
router.post('/:deviceId/schedule', authRequired, mapController.createDeviceSchedule);
router.patch('/:deviceId/schedule', authRequired, mapController.updateDeviceSchedule);
// router.delete('/:deviceId/schedule', authRequired, mapController.deleteDeviceSchedule);    

module.exports = router;
