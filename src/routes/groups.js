const express = require('express');
const router = express.Router();
const groupController = require('../controllers/group.controller');
const { authRequired, allowGroups } = require('../middleware/auth');

router.get('/', authRequired, groupController.listGroups);

router.post('/', authRequired, allowGroups('admin', 'admins'), groupController.createGroup);

router.post('/:groupName/users', authRequired, allowGroups('admin', 'admins'), groupController.addUserToGroup);

module.exports = router;
