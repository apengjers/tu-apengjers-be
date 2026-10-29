const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  discountType: { type: String, enum: ['percent', 'fixed'], required: true },
  discountValue: { type: Number, required: true, min: 1 },
  maxDiscount: { type: Number, min: 1 },
  minimumPurchase: { type: Number, default: 0, min: 0 },
  scope: { type: String, enum: ['all', 'joki', 'gift', 'game'], default: 'all' },
  eligibleGames: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Game' }],
  oneUsePerUser: { type: Boolean, default: true },
  active: { type: Boolean, default: true },
  startsAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Voucher', voucherSchema);
