const User = require('../models/User');
const cloudinary = require('../config/cloudinary');

const MIN_PASSWORD = 8;

const serializeProfile = (user) => ({
  id: user._id,
  email: user.email,
  displayName: user.displayName,
  role: user.role,
  photo: user.photo,
  phone: user.phone || '',
  hasPassword: Boolean(user.password),
});

const uploadAvatar = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'apengjers/avatars',
        resource_type: 'image',
        transformation: [{ width: 256, height: 256, crop: 'fill', gravity: 'face' }],
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
    stream.end(buffer);
  });

exports.getProfile = async (req, res) => {
  res.json(serializeProfile(req.user));
};

exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });

    if (req.body.displayName !== undefined) {
      const displayName = String(req.body.displayName).trim();
      if (displayName.length < 2 || displayName.length > 60) {
        return res.status(400).json({ message: 'Nama harus 2 sampai 60 karakter' });
      }
      user.displayName = displayName;
    }

    if (req.body.phone !== undefined) {
      const phone = String(req.body.phone).replace(/[\s()-]/g, '');
      if (phone && !/^\+?\d{8,15}$/.test(phone)) {
        return res.status(400).json({ message: 'Nomor WhatsApp tidak valid' });
      }
      user.phone = phone;
    }

    if (req.file) {
      if (!cloudinary.isConfigured) {
        return res.status(503).json({ message: 'Upload foto belum tersedia (Cloudinary belum dikonfigurasi)' });
      }
      const result = await uploadAvatar(req.file.buffer);
      user.photo = result.secure_url;
    }

    await user.save();
    res.json(serializeProfile(user));
  } catch (error) {
    console.error('Gagal memperbarui profil:', error);
    res.status(500).json({ message: 'Profil belum berhasil disimpan' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD) {
      return res.status(400).json({ message: `Kata sandi baru minimal ${MIN_PASSWORD} karakter` });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });

    // Akun Google tanpa password boleh membuat password pertama kali tanpa password lama
    if (user.password) {
      if (!currentPassword || !(await user.comparePassword(String(currentPassword)))) {
        return res.status(400).json({ message: 'Kata sandi saat ini salah' });
      }
    }

    user.password = newPassword; // di-hash oleh pre('save') di model User
    await user.save();
    res.json({ message: 'Kata sandi berhasil diubah' });
  } catch (error) {
    console.error('Gagal mengubah kata sandi:', error);
    res.status(500).json({ message: 'Kata sandi belum berhasil diubah' });
  }
};