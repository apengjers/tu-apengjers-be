const Game = require('../models/Game');
const Product = require('../models/Product');

exports.getGames = async (req, res) => {
  try {
    const filter = {};
    if (req.query.jenis === 'joki') filter.$or = [{ jenis: 'joki' }, { jenis: { $exists: false } }];
    else if (req.query.jenis) filter.jenis = req.query.jenis;
    if (req.query.featured === 'true') filter.isFeatured = true;
    const sort = req.query.featured === 'true' ? { featuredOrder: 1, nama: 1 } : { nama: 1 };
    res.json(await Game.find(filter).sort(sort));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createGame = async (req, res) => {
  try {
    const game = await Game.create({
      nama: req.body.nama,
      slug: req.body.slug,
      gambar: req.body.gambar || '',
      jenis: req.body.jenis || 'joki',
      isFeatured: Boolean(req.body.isFeatured),
      featuredOrder: Math.max(0, Number(req.body.featuredOrder) || 0),
    });
    res.status(201).json(game);
  } catch (err) {
    res.status(err.code === 11000 ? 409 : 400).json({ message: err.code === 11000 ? 'Slug game sudah digunakan pada kategori ini' : err.message });
  }
};

exports.updateGame = async (req, res) => {
  try {
    const nextJenis = req.body.jenis || 'joki';
    const incompatibleProduct = await Product.exists({ game: req.params.id, jenis: { $ne: nextJenis } });
    if (incompatibleProduct) return res.status(409).json({ message: 'Kategori game tidak bisa diubah karena masih dipakai produk kategori lain.' });
    const game = await Game.findByIdAndUpdate(req.params.id, {
      nama: req.body.nama,
      slug: req.body.slug,
      gambar: req.body.gambar || '',
      jenis: nextJenis,
      isFeatured: Boolean(req.body.isFeatured),
      featuredOrder: Math.max(0, Number(req.body.featuredOrder) || 0),
    }, { new: true, runValidators: true });
    if (!game) return res.status(404).json({ message: 'Game tidak ditemukan' });
    res.json(game);
  } catch (err) {
    res.status(err.code === 11000 ? 409 : 400).json({ message: err.code === 11000 ? 'Slug game sudah digunakan pada kategori ini' : err.message });
  }
};

exports.deleteGame = async (req, res) => {
  try {
    const usedByProducts = await Product.exists({ game: req.params.id });
    if (usedByProducts) return res.status(409).json({ message: 'Game masih memiliki produk joki. Hapus atau pindahkan produknya terlebih dahulu.' });
    const game = await Game.findByIdAndDelete(req.params.id);
    if (!game) return res.status(404).json({ message: 'Game tidak ditemukan' });
    res.json({ message: 'Game dihapus' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
