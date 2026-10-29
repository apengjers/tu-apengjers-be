const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderCode: { type: String, required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  jenis: { type: String, enum: ['joki', 'gift'], required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game' },
  productName: { type: String, required: true },
  gameName: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 1, max: 99 },
  unitPrice: { type: Number, required: true, min: 0 },
  totalPrice: { type: Number, required: true, min: 0 },
  robloxUsername: { type: String, default: '' },
  displayName: { type: String, default: '' },
  recipientUsername: { type: String, default: '' },
  whatsapp: { type: String, required: true },
  contactEmail: { type: String, default: '' },
  notes: { type: String, default: '' },
  requestedPaymentMethod: { type: String, enum: ['qris', 'bank', 'ewallet'] },
  status: { type: String, enum: ['new', 'confirmed', 'processing', 'completed', 'cancelled'], default: 'new' },
  paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },
  stockReserved: { type: Boolean, default: false },
}, { timestamps: true });

orderSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);