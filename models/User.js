const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  displayName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: {
    type: String,
    required: function () {
      return !this.googleId;
    },
  },
  googleId: { type: String, unique: true, sparse: true },
  role: { type: String, default: 'user' },
  photo: { type: String },
  phone: { type: String, default: '', trim: true },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
});

userSchema.pre('save', async function (next) {
  if (!this.password || !this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (password) {
  if (!this.password) return false;
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);