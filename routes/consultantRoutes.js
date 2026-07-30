const express = require('express');
const consultantController = require('../controllers/consultantController');
const { requireAnyPermission, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAnyPermission('physicians.view', 'physicians.manage'), consultantController.index);
router.post('/', requirePermission('physicians.manage'), consultantController.create);
router.post('/print-settings', requirePermission('physicians.manage'), consultantController.updatePrintSettings);
router.post('/:id/delete', requirePermission('physicians.manage'), consultantController.remove);

module.exports = router;
