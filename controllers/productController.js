const Product = require('../models/Product');
const Game = require('../models/Game');
const { sendDiscordStockNotification } = require('../services/discordWebhookService');

const validateCatalogGame = async (body, res) => {
  if (!['joki', 'gift'].includes(body.jenis)) return true;
  if (!body.game && body.jenis === 'gift') return true;
  const game = body.game ? await Game.findById(body.game) : null;
  if (!game || (body.jenis === 'joki' && !['joki', undefined].includes(game.jenis)) || (body.jenis === 'gift' && game.jenis !== 'gift')) {
    res.status(400).json({ message: 'Pilih game yang terdaftar pada kategori produk yang sesuai' });
    return false;
  }
  return true;
};

// Create Product
exports.createProduct = async (req, res) => {
  try {
    if (!(await validateCatalogGame(req.body, res))) return;
    const product = new Product(req.body);
    await product.save();

    // Trigger webhook kalau dibuat langsung dengan stok 0
    if (Number(product.stok) === 0) {
      await sendDiscordStockNotification(product);
    }

    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get All Products
exports.getProducts = async (req, res) => {
  try {
    const filter = req.query.jenis ? { jenis: req.query.jenis } : {};
    const products = await Product.find(filter).populate('game');
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get Single Product
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('game');
    if (!product) return res.status(404).json({ message: 'Not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update Product
exports.updateProduct = async (req, res) => {
  try {
    const current = await Product.findById(req.params.id);
    if (!current) return res.status(404).json({ message: 'Not found' });
    const nextProduct = { ...current.toObject(), ...req.body };
    if (!(await validateCatalogGame(nextProduct, res))) return;
    
    const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: 'Not found' });

    // Panggil webhook Discord kalau stok produk berubah jadi 0
    if (Number(updated.stok) === 0) {
      await sendDiscordStockNotification(updated);
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete Product
exports.deleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};