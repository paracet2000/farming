const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authRequired } = require('../middleware/auth');

router.get('/', authRequired, userController.listUsers);

router.get('/:id', authRequired, userController.getUserById);

router.put('/:id', authRequired, userController.updateUserById);

module.exports = router;
