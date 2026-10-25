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
router.get('/', ...adminOnly, orderController.getOrders);
router.patch('/:id', ...adminOnly, orderController.updateOrder);

module.exports = router;
