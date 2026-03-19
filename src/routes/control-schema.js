const express = require('express');
const router = express.Router();
const controlSchemaController = require('../controllers/control-schema.controller');
const { authRequired } = require('../middleware/auth');

router.get('/', authRequired, controlSchemaController.listControlSchema);
router.post('/', authRequired, controlSchemaController.createControlSchema);
router.patch('/:id', authRequired, controlSchemaController.updateControlSchema);
router.delete('/:id', authRequired, controlSchemaController.deleteControlSchema);

module.exports = router;
