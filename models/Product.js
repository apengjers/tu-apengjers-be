const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  nama: { type: String, required: true },
  jenis: { type: String, enum: ['topup', 'gift'], default: 'topup' },
  harga: { type: Number, required: true },
  kategori: { type: String },
  stok: { type: Number, default: 0 },
  deskripsi: { type: String },
  gambar: { type: String }, // bisa URL gambar
  customFields: { type: Map, of: String }, // ini untuk kolom dinamis
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
