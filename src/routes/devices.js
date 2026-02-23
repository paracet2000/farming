const express = require('express');
const router = express.Router();
const devController = require('../controllers/device.controller');
const { authRequired } = require('../middleware/auth');

router.get('/', authRequired, devController.listDevices); //allow all authenticated users to list devices
router.post('/', authRequired, devController.createDevice);
router.get('/:id', authRequired, devController.getDeviceById);
router.put('/:id', authRequired, devController.updateDeviceById);
router.delete('/:id', authRequired, devController.deleteDeviceById);

module.exports = router;