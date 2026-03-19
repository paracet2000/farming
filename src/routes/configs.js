const express = require('express');
const router = express.Router();
const configController = require('../controllers/config.controller');

router.get('/menu', configController.listMenu);
router.get('/pin-def', configController.listPinDefinitions);
router.get('/page', configController.getPageConfig);

module.exports = router;
