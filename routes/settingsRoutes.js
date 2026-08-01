const express = require('express');
const settingsController = require('../controllers/settingsController');

const router = express.Router();

router.get('/', settingsController.index);
router.post('/receipt', settingsController.updateReceipt);
router.post('/sale-receipt', settingsController.updateSaleReceipt);

module.exports = router;
