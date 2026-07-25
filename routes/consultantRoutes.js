const express = require('express');
const consultantController = require('../controllers/consultantController');

const router = express.Router();

router.get('/', consultantController.index);
router.post('/', consultantController.create);
router.post('/print-settings', consultantController.updatePrintSettings);
router.post('/:id/delete', consultantController.remove);

module.exports = router;
