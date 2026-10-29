const mongoose = require('mongoose');

const voucherUsageSchema = new mongoose.Schema({
  voucher: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', required: true },
  identity: { type: String, required: true },
  userIdentity: { type: String },
  orderCode: { type: String, required: true, unique: true },
  usedAt: { type: Date, default: Date.now },
}, { timestamps: true });

voucherUsageSchema.index({ voucher: 1, identity: 1 }, { unique: true });
voucherUsageSchema.index(
  { voucher: 1, userIdentity: 1 },
  { unique: true, partialFilterExpression: { userIdentity: { $exists: true } } },
);

module.exports = mongoose.model('VoucherUsage', voucherUsageSchema);
