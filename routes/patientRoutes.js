const express = require('express');
const patientController = require('../controllers/patientController');

const router = express.Router();

router.get('/', patientController.index);
router.get('/new', patientController.newForm);
router.post('/', patientController.create);
router.get('/:id/edit', patientController.editForm);
router.post('/:id/update', patientController.update);
router.post('/:id/delete', patientController.remove);
router.get('/:id/token', patientController.token);

module.exports = router;
