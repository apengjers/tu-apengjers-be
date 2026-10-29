const express = require('express');
const passport = require('passport');
const multer = require('multer');
const userController = require('../controllers/userController');

const router = express.Router();
const jwtAuth = passport.authenticate('jwt', { session: false });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Foto harus JPG, PNG, atau WebP'));
  },
});

router.get('/me', jwtAuth, userController.getProfile);
router.patch('/me', jwtAuth, (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, userController.updateProfile);
router.patch('/me/password', jwtAuth, userController.changePassword);

module.exports = router;