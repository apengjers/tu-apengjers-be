const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  nama: { type: String, required: true },
  jenis: { type: String, enum: ['topup', 'gift', 'joki'], default: 'topup' },
  game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: function () { return this.jenis === 'joki'; } },
  harga: { type: Number, required: true },
  kategori: { type: String },
  stok: { type: Number, default: 0 },
  deskripsi: { type: String },
  gambar: { type: String }, // bisa URL gambar
  customFields: { type: Map, of: String },
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
