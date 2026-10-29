const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { sendPasswordResetEmail } = require('../services/mailService');

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const RESET_TTL_MS = 30 * 60 * 1000; // 30 menit

const signToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

const serializeUser = (user) => ({
  id: user._id,
  email: user.email,
  displayName: user.displayName,
  role: user.role,
  photo: user.photo,
});

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// REGISTER (langsung login setelah daftar)
router.post('/register', async (req, res) => {
  try {
    const displayName = String(req.body.displayName || '').trim();
    const email = String(req.body.email || '').trim();
    const password = String(req.body.password || '');

    if (displayName.length < 2) {
      return res.status(400).json({ message: 'Nama minimal 2 karakter' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Format email tidak valid' });
    }
    if (password.length < MIN_PASSWORD) {
      return res.status(400).json({ message: `Kata sandi minimal ${MIN_PASSWORD} karakter` });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email sudah digunakan' });

    const user = new User({ displayName, email, password });
    await user.save();

    res.status(201).json({
      message: 'Registrasi berhasil',
      token: signToken(user),
      user: serializeUser(user),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error saat register' });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });

    // Akun yang dibuat lewat Google belum punya password
    if (!user.password) {
      return res.status(400).json({
        message: 'Akun ini terdaftar lewat Google. Masuk dengan Google atau atur kata sandi lewat "Lupa kata sandi".',
      });
    }

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ message: 'Password salah' });

    res.json({ token: signToken(user), user: serializeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login gagal' });
  }
});

// KIRIM GOOGLE CLIENT ID KE FRONTEND (client ID bukan secret, aman dikirim)
router.get('/google/config', (req, res) => {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID || null });
});

// LOGIN / DAFTAR DENGAN GOOGLE (Google Identity Services -> ID token)
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: 'Token Google tidak ditemukan' });
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ message: 'Login Google belum dikonfigurasi di server' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.email_verified) {
      return res.status(400).json({ message: 'Email Google belum terverifikasi' });
    }

    let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email: payload.email }] });

    if (!user) {
      user = await User.create({
        displayName: payload.name || payload.email.split('@')[0],
        email: payload.email,
        googleId: payload.sub,
        photo: payload.picture,
      });
    } else {
      // Hubungkan akun lama (email/password) dengan Google bila email sama
      let changed = false;
      if (!user.googleId) { user.googleId = payload.sub; changed = true; }
      if (!user.photo && payload.picture) { user.photo = payload.picture; changed = true; }
      if (changed) await user.save();
    }

    res.json({ token: signToken(user), user: serializeUser(user) });
  } catch (err) {
    console.error('Google login error:', err.message);
    res.status(401).json({ message: 'Verifikasi akun Google gagal. Coba lagi.' });
  }
});

// LUPA KATA SANDI -> kirim email berisi tautan reset
router.post('/forgot-password', async (req, res) => {
  const genericResponse = {
    message: 'Jika email terdaftar, tautan untuk mengatur ulang kata sandi sudah dikirim.',
  };

  try {
    const email = String(req.body.email || '').trim();
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Format email tidak valid' });
    }

    const user = await User.findOne({ email });
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = sha256(rawToken);
      user.resetPasswordExpires = new Date(Date.now() + RESET_TTL_MS);
      await user.save();

      const resetUrl = `${FRONTEND_URL}/?reset=${rawToken}`;
      try {
        await sendPasswordResetEmail(user.email, user.displayName, resetUrl);
        if (process.env.NODE_ENV !== 'production') {
          console.log('🔑 Reset link (dev):', resetUrl);
        }
      } catch (mailErr) {
        console.error('Gagal mengirim email reset:', mailErr.message);
      }
    }

    // Respons selalu sama, baik email terdaftar maupun tidak
    res.json(genericResponse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Terjadi kesalahan. Coba lagi nanti.' });
  }
});

// RESET KATA SANDI dengan token dari email
router.post('/reset-password', async (req, res) => {
  try {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');

    if (!token) return res.status(400).json({ message: 'Token reset tidak valid' });
    if (password.length < MIN_PASSWORD) {
      return res.status(400).json({ message: `Kata sandi minimal ${MIN_PASSWORD} karakter` });
    }

    const user = await User.findOne({
      resetPasswordToken: sha256(token),
      resetPasswordExpires: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({
        message: 'Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru.',
      });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Kata sandi berhasil diperbarui. Silakan masuk.', email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal memperbarui kata sandi' });
  }
});

// Cek user login pakai token
router.get('/me', passport.authenticate('jwt', { session: false }), (req, res) => {
  res.json(serializeUser(req.user));
});

module.exports = router;