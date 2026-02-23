const express = require('express');
const router = express.Router();
const configController = require('../controllers/config.controller');

router.get('/menu', configController.listMenu);

module.exports = router;

