const express = require('express');
const router = express.Router();
const groupController = require('../controllers/group.controller');
const { authRequired } = require('../middleware/auth');

router.get('/', authRequired, groupController.listGroups);

router.post('/', authRequired, groupController.createGroup);

router.post('/:groupName/users', authRequired, groupController.addUserToGroup);

module.exports = router;
