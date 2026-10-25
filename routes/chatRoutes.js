const express = require('express');
const passport = require('passport');
const router = express.Router();
const { chat, myOrders, extractOrder } = require('../controllers/chatController');

const jwtAuth = passport.authenticate('jwt', { session: false });

// POST /api/chat        — tanya produk/joki/item (public)
router.post('/', chat);

// POST /api/chat/extract-order — ekstrak info order dari pesan (public)
router.post('/extract-order', extractOrder);

// GET  /api/chat/orders — cek pesanan user login (protected)
router.get('/orders', jwtAuth, myOrders);

module.exports = router;
