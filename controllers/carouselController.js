const CarouselSlide = require('../models/CarouselSlide');
const cloudinary = require('../config/cloudinary');

const uploadImage = (buffer) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { folder: 'apengjers/carousel', resource_type: 'image' },
    (error, result) => error ? reject(error) : resolve(result),
  );
  stream.end(buffer);
});

const destroyImage = async (publicId) => {
  if (publicId) await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
};

const ensureCloudinaryConfigured = (res) => {
  if (cloudinary.isConfigured) return true;
  res.status(503).json({
    message: 'Cloudinary belum dikonfigurasi. Isi CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, dan CLOUDINARY_API_SECRET di backend/.env, lalu restart backend.',
  });
  return false;
};

const parseSlideFields = (body) => {
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const href = String(body.href || '').trim();
  const sortOrder = Number(body.sortOrder ?? 0);
  const isActive = body.isActive === 'false' || body.isActive === false ? false : true;
  if (!title || title.length > 120) throw new Error('Judul wajib diisi dan maksimal 120 karakter');
  if (description.length > 240) throw new Error('Deskripsi maksimal 240 karakter');
  if (href && (!href.startsWith('/') || href.startsWith('//'))) throw new Error('Tautan carousel harus berupa route internal, contoh /gift-item');
  if (!Number.isInteger(sortOrder) || sortOrder < 0) throw new Error('Urutan harus berupa angka nol atau lebih');
  return { title, description, href, sortOrder, isActive };
};

exports.getActiveSlides = async (_req, res) => {
  try {
    res.json(await CarouselSlide.find({ isActive: true }).sort({ sortOrder: 1, createdAt: 1 }).select('-publicId'));
  } catch (error) {
    res.status(500).json({ message: 'Carousel gagal dimuat', error: error.message });
  }
};

exports.getAllSlides = async (_req, res) => {
  try {
    res.json(await CarouselSlide.find().sort({ sortOrder: 1, createdAt: 1 }));
  } catch (error) {
    res.status(500).json({ message: 'Daftar carousel gagal dimuat', error: error.message });
  }
};

exports.createSlide = async (req, res) => {
  let uploaded = null;
  try {
    if (!req.file) return res.status(400).json({ message: 'Pilih file gambar terlebih dahulu' });
    const fields = parseSlideFields(req.body);
    if (!ensureCloudinaryConfigured(res)) return;
    uploaded = await uploadImage(req.file.buffer);
    const slide = await CarouselSlide.create({ ...fields, imageUrl: uploaded.secure_url, publicId: uploaded.public_id });
    res.status(201).json(slide);
  } catch (error) {
    if (uploaded?.public_id) await destroyImage(uploaded.public_id).catch(() => {});
    res.status(400).json({ message: error.message || 'Carousel gagal disimpan' });
  }
};

exports.updateSlide = async (req, res) => {
  let uploaded = null;
  let oldPublicId = null;
  try {
    const slide = await CarouselSlide.findById(req.params.id);
    if (!slide) return res.status(404).json({ message: 'Slide tidak ditemukan' });
    const fields = parseSlideFields(req.body);
    oldPublicId = slide.publicId;
    if (req.file) {
      if (!ensureCloudinaryConfigured(res)) return;
      uploaded = await uploadImage(req.file.buffer);
    }
    Object.assign(slide, fields);
    if (uploaded) {
      slide.imageUrl = uploaded.secure_url;
      slide.publicId = uploaded.public_id;
    }
    await slide.save();
    if (uploaded && oldPublicId !== slide.publicId) await destroyImage(oldPublicId).catch(() => {});
    res.json(slide);
  } catch (error) {
    if (uploaded?.public_id) await destroyImage(uploaded.public_id).catch(() => {});
    res.status(400).json({ message: error.message || 'Carousel gagal diperbarui' });
  }
};

exports.deleteSlide = async (req, res) => {
  try {
    const slide = await CarouselSlide.findByIdAndDelete(req.params.id);
    if (!slide) return res.status(404).json({ message: 'Slide tidak ditemukan' });
    await destroyImage(slide.publicId).catch((error) => console.error('Gagal hapus asset Cloudinary:', error.message));
    res.json({ message: 'Slide dihapus' });
  } catch (error) {
    res.status(500).json({ message: 'Slide gagal dihapus', error: error.message });
  }
};
