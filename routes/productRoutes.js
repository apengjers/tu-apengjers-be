const express = require('express');
const passport = require('passport');
const router = express.Router();
const productController = require('../controllers/productController');

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Akses khusus admin' });
  }
  next();
};

router.post('/', passport.authenticate('jwt', { session: false }), requireAdmin, productController.createProduct);
router.get('/', productController.getProducts);
router.get('/:id', productController.getProductById);
router.put('/:id', passport.authenticate('jwt', { session: false }), requireAdmin, productController.updateProduct);
router.delete('/:id', passport.authenticate('jwt', { session: false }), requireAdmin, productController.deleteProduct);

module.exports = router;
