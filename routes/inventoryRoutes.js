const express = require('express');
const multer = require('multer');
const inventoryController = require('../controllers/inventoryController');
const { requirePermission, requireAnyPermission } = require('../middleware/auth');

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

router.get('/', requirePermission('inventory.view'), inventoryController.index);
router.get('/products/:id', requirePermission('inventory.view'), inventoryController.productDetails);
router.post('/products/:id/resolve-packaging', requirePermission('stock.upload'), inventoryController.resolvePackaging);
router.post('/products/:id/resolve-pricing', requirePermission('stock.upload'), inventoryController.resolvePricing);
router.get('/batches/:id/edit', requirePermission('stock.upload'), inventoryController.editBatchForm);
router.post('/batches/:id/edit', requirePermission('stock.upload'), inventoryController.updateBatch);
router.get('/sales', requirePermission('sales.manage'), inventoryController.salesIndex);
router.get('/sales/:id/bill', requireAnyPermission('sales.manage', 'patients.manage'), inventoryController.saleBill);
router.post('/sales/:id/delete', requirePermission('sales.manage'), inventoryController.deleteSale);
router.get('/sale', requirePermission('sales.manage'), inventoryController.showSale);
router.post('/sale', requirePermission('sales.manage'), inventoryController.createSale);
router.get('/add', requirePermission('stock.upload'), inventoryController.showAddStock);
router.post('/add', requirePermission('stock.upload'), inventoryController.addStock);
// CSV stock upload is temporarily disabled. Keep these routes for easy restoration.
// router.get('/upload', requirePermission('stock.upload'), inventoryController.showUpload);
// router.get('/upload/template', requirePermission('stock.upload'), inventoryController.downloadTemplate);
// router.post('/upload', requirePermission('stock.upload'), upload.single('medicineFile'), inventoryController.uploadMedicines);

module.exports = router;
