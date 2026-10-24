const express = require('express');
const passport = require('passport');
const router = express.Router();
const { chat, myOrders } = require('../controllers/chatController');

const jwtAuth = passport.authenticate('jwt', { session: false });

// POST /api/chat        — tanya produk/joki/item (public, tidak perlu login)
router.post('/', chat);

// GET  /api/chat/orders — cek pesanan user yang login (wajib login)
router.get('/orders', jwtAuth, myOrders);

module.exports = router;
