const express = require('express');
const userController = require('../controllers/userController');

const router = express.Router();

router.get('/', userController.index);
router.post('/', userController.create);
router.post('/:id/toggle-status', userController.toggleStatus);
router.post('/:id/role', userController.updateRole);
router.post('/:id/reset-password', userController.resetPassword);

module.exports = router;
