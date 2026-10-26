const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderCode: { type: String, required: true, unique: true, index: true },
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
  robloxPasswordEncrypted: { type: String, select: false },
  recipientUsername: { type: String, default: '' },
  whatsapp: { type: String, required: true },
  contactEmail: { type: String, default: '' },
  notes: { type: String, default: '' },
  requestedPaymentMethod: { type: String, enum: ['qris', 'va', 'bank', 'ewallet'] }, // 'bank' = data lama
  paymentChannel: { type: String, default: '' }, // channel Snap, mis. bca_va, gopay, other_qris
  status: { type: String, enum: ['new', 'confirmed', 'processing', 'completed', 'cancelled'], default: 'new' },
  paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },
  stockReserved: { type: Boolean, default: false },
  // Midtrans
  snapToken: { type: String, default: '' },
  snapRedirectUrl: { type: String, default: '' },
  midtransTransactionId: { type: String, default: '' },
  paymentType: { type: String, default: '' },
  paymentDetails: { type: mongoose.Schema.Types.Mixed, default: null },
  paymentCreatingAt: { type: Date, default: null },
  paidAt: { type: Date },
}, { timestamps: true });

orderSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
