const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authRequired } = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/device/login', authController.deviceLogin);
router.get('/me', authRequired, authController.me);

module.exports = router;
