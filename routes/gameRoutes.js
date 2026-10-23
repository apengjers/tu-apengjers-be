const express = require('express');
const passport = require('passport');
const gameController = require('../controllers/gameController');

const router = express.Router();
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Akses khusus admin' });
  next();
};
const adminOnly = [passport.authenticate('jwt', { session: false }), requireAdmin];

router.get('/', gameController.getGames);
router.post('/', ...adminOnly, gameController.createGame);
router.put('/:id', ...adminOnly, gameController.updateGame);
router.delete('/:id', ...adminOnly, gameController.deleteGame);

module.exports = router;
