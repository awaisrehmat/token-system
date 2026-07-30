const express = require('express');
const multer = require('multer');
const inventoryController = require('../controllers/inventoryController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const isCsv = file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.toLowerCase().endsWith('.csv');
    callback(isCsv ? null : new Error('Only CSV files are allowed.'), isCsv);
  }
});

router.get('/', inventoryController.index);
router.get('/sale', inventoryController.showSale);
router.post('/sale', inventoryController.createSale);
router.get('/upload', inventoryController.showUpload);
router.get('/upload/template', inventoryController.downloadTemplate);
router.post('/upload', upload.single('medicineFile'), inventoryController.uploadMedicines);

module.exports = router;
