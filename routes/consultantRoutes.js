const express = require('express');
const consultantController = require('../controllers/consultantController');
const { requireAnyPermission, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAnyPermission('physicians.view', 'physicians.manage'), consultantController.index);
router.post('/', requirePermission('physicians.manage'), consultantController.create);
// Physician deletion is intentionally disabled to preserve patient and visit history.

module.exports = router;
