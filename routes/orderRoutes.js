const express = require('express');
const passport = require('passport');
const orderController = require('../controllers/orderController');

const router = express.Router();
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Akses khusus admin' });
  next();
};
const adminOnly = [passport.authenticate('jwt', { session: false }), requireAdmin];

router.post('/', orderController.createOrder);
router.get('/track/:orderCode', orderController.trackOrder);
router.get('/summary', ...adminOnly, orderController.getOrderSummary);

// Route Konfigurasi Webhook Discord (Admin)
router.get('/webhook-setting', ...adminOnly, orderController.getWebhookSetting);
router.put('/webhook-setting', ...adminOnly, orderController.updateWebhookSetting);
router.post('/webhook-setting/test', ...adminOnly, orderController.testWebhookSetting);

router.get('/', ...adminOnly, orderController.getOrders);
router.post('/:id/credentials', ...adminOnly, orderController.getOrderCredentials);
router.patch('/:id', ...adminOnly, orderController.updateOrder);

module.exports = router;
