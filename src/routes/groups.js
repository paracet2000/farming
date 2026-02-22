const express = require('express');
const router = express.Router();
const groupController = require('../controllers/group.controller');
const { authRequired } = require('../middleware/auth');

router.get('/', authRequired, groupController.listGroups);

router.post('/', authRequired, groupController.createGroup);

router.post('/:name/users', authRequired, groupController.addUserToGroup);

// router.delete('/:name/users', authRequired, groupController.removeUserFromGroup);

module.exports = router;
