const mongoose = require('mongoose');

const carouselSlideSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', trim: true, maxlength: 240 },
  imageUrl: { type: String, required: true },
  publicId: { type: String, required: true },
  href: { type: String, default: '', trim: true, maxlength: 300 },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

carouselSlideSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('CarouselSlide', carouselSlideSchema);
