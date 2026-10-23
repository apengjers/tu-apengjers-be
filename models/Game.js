const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  nama: { type: String, required: true, trim: true, maxlength: 100 },
  slug: { type: String, required: true, trim: true, lowercase: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  gambar: { type: String, default: '' },
  jenis: { type: String, enum: ['joki', 'gift'], default: 'joki' },
}, { timestamps: true });

gameSchema.index({ jenis: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('Game', gameSchema);
