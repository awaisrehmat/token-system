const express = require('express');
const patientController = require('../controllers/patientController');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();
router.use(requirePermission('patients.manage'));

router.get('/', patientController.index);
router.get('/new', patientController.newForm);
router.post('/', patientController.create);
router.get('/:id/history', patientController.history);
router.post('/:id/revisit', patientController.revisit);
router.get('/:id/edit', patientController.editForm);
router.post('/:id/update', patientController.update);
router.post('/:id/delete', patientController.remove);
router.get('/:id/token', patientController.token);

module.exports = router;
