const express = require('express');
const passport = require('passport');
const router = express.Router();
const { adminChat, adminSummary, getNewOrders, updateOrderStatus } = require('../controllers/adminChatController');

const jwtAuth = passport.authenticate('jwt', { session: false });
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Akses khusus admin' });
  next();
};
const adminOnly = [jwtAuth, requireAdmin];

router.post('/',              ...adminOnly, adminChat);
router.get('/summary',        ...adminOnly, adminSummary);
router.get('/orders/new',     ...adminOnly, getNewOrders);
router.patch('/orders/:id/status', ...adminOnly, updateOrderStatus);

module.exports = router;
