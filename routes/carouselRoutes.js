const express = require('express');
const multer = require('multer');
const passport = require('passport');
const carouselController = require('../controllers/carouselController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      return callback(new Error('Gunakan gambar JPG, PNG, WebP, atau GIF'));
    }
    callback(null, true);
  },
});
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Akses khusus admin' });
  next();
};
const adminOnly = [passport.authenticate('jwt', { session: false }), requireAdmin];

router.get('/', carouselController.getActiveSlides);
router.get('/admin', ...adminOnly, carouselController.getAllSlides);
router.post('/', ...adminOnly, upload.single('image'), carouselController.createSlide);
router.put('/:id', ...adminOnly, upload.single('image'), carouselController.updateSlide);
router.delete('/:id', ...adminOnly, carouselController.deleteSlide);

module.exports = router;
