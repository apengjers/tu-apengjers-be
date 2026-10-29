const express = require('express');
const passport = require('passport');
const orderController = require('../controllers/orderController');

const router = express.Router();
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Akses khusus admin' });
  next();
};
const jwtAuth = passport.authenticate('jwt', { session: false });
const optionalAuth = (req, res, next) => {
  if (!req.headers.authorization) return next();
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (user) req.user = user;
    next();
  })(req, res, next);
};
const adminOnly = [jwtAuth, requireAdmin];

router.post('/', optionalAuth, orderController.createOrder);
router.get('/mine', jwtAuth, orderController.getMyOrders);
router.get('/mine/counts', jwtAuth, orderController.getMyOrderCounts);
router.get('/mine/:orderCode', jwtAuth, orderController.getMyOrder);
router.get('/track/:orderCode', orderController.trackOrder);
router.get('/summary', ...adminOnly, orderController.getOrderSummary);
router.get('/', ...adminOnly, orderController.getOrders);
router.patch('/:id', ...adminOnly, orderController.updateOrder);

module.exports = router;