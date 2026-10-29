const express = require('express');
const passport = require('passport');
const voucherController = require('../controllers/voucherController');
const optionalJwt = require('../middleware/optionalJwt');

const router = express.Router();
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Akses khusus admin' });
  next();
};
const adminOnly = [passport.authenticate('jwt', { session: false }), requireAdmin];

router.get('/', voucherController.listAvailable);
router.post('/validate', optionalJwt, voucherController.validate);
router.get('/admin', ...adminOnly, voucherController.listForAdmin);
router.post('/', ...adminOnly, voucherController.create);
router.put('/:id', ...adminOnly, voucherController.update);
router.patch('/:id/active', ...adminOnly, voucherController.setActive);

module.exports = router;
