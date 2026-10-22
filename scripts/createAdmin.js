require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const email = 'admin@example.com';
  const password = 'admin123';

  const existing = await User.findOne({ email });
  if (existing) {
    console.log('❌ Admin sudah ada');
    return process.exit();
  }

  const hash = await bcrypt.hash(password, 10);

  const admin = new User({
    displayName: 'Admin',
    email,
    password: hash,
    role: 'admin',
  });

  await admin.save();
  console.log('✅ Admin berhasil dibuat');
  process.exit();
};

main();
