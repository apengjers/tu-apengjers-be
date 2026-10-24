const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');

const allowedStatuses = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

exports.createOrder = async (req, res) => {
  let reservedStock = false;
  let reservedProductId = null;

  try {
    const {
      jenis,
      productId,
      quantity: rawQuantity,
      robloxUsername,
      displayName,
      recipientUsername,
      whatsapp,
      contactEmail,
      notes,
      requestedPaymentMethod,
    } = req.body;

    const quantity = Number(rawQuantity);
    const normalizedWhatsapp = String(whatsapp || '').replace(/[\s()-]/g, '');
    if (!['joki', 'gift'].includes(jenis)) return res.status(400).json({ message: 'Jenis order tidak valid' });
    if (!mongoose.isValidObjectId(productId)) return res.status(400).json({ message: 'Produk tidak valid' });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return res.status(400).json({ message: 'Jumlah harus antara 1 sampai 99' });
    if (!/^\+?\d{8,15}$/.test(normalizedWhatsapp)) return res.status(400).json({ message: 'Nomor WhatsApp tidak valid' });
    if (jenis === 'gift' && !String(recipientUsername || '').trim()) return res.status(400).json({ message: 'Username penerima wajib diisi' });
    if (jenis === 'joki' && (!String(robloxUsername || '').trim() || !String(displayName || '').trim())) {
      return res.status(400).json({ message: 'Username dan display name Roblox wajib diisi' });
    }

    const product = await Product.findOne({ _id: productId, jenis }).populate('game');
    if (!product) return res.status(404).json({ message: 'Produk tidak ditemukan atau tidak tersedia' });

    if (product.stok > 0) {
      const reserved = await Product.findOneAndUpdate(
        { _id: product._id, stok: { $gte: quantity } },
        { $inc: { stok: -quantity } },
        { new: true },
      );
      if (!reserved) return res.status(409).json({ message: 'Stok tidak cukup untuk jumlah tersebut' });
      reservedStock = true;
      reservedProductId = product._id;
    } else if (jenis === 'gift') {
      return res.status(409).json({ message: 'Gift sedang habis' });
    }

    const order = await Order.create({
      orderCode: `AJ-${crypto.randomBytes(16).toString('hex').toUpperCase()}`,
      jenis,
      product: product._id,
      game: product.game?._id,
      productName: product.nama,
      gameName: product.game?.nama || '',
      quantity,
      unitPrice: product.harga,
      totalPrice: product.harga * quantity,
      robloxUsername: String(robloxUsername || '').trim(),
      displayName: String(displayName || '').trim(),
      recipientUsername: String(recipientUsername || '').trim(),
      whatsapp: normalizedWhatsapp,
      contactEmail: String(contactEmail || '').trim(),
      notes: String(notes || '').trim().slice(0, 1000),
      requestedPaymentMethod: ['qris', 'bank', 'ewallet'].includes(requestedPaymentMethod) ? requestedPaymentMethod : undefined,
      stockReserved: reservedStock,
    });

    res.status(201).json({
      order: {
        orderCode: order.orderCode,
        status: order.status,
        jenis: order.jenis,
        productName: order.productName,
        gameName: order.gameName,
        quantity: order.quantity,
        unitPrice: order.unitPrice,
        totalPrice: order.totalPrice,
        createdAt: order.createdAt,
      },
      message: 'Permintaan order diterima. Admin akan menghubungi melalui WhatsApp untuk konfirmasi.',
    });
  } catch (error) {
    if (reservedStock && reservedProductId) {
      await Product.updateOne({ _id: reservedProductId }, { $inc: { stok: Number(req.body.quantity) || 0 } }).catch(() => {});
    }
    console.error('Gagal membuat order:', error);
    res.status(500).json({ message: 'Order belum berhasil disimpan' });
  }
};

exports.getOrderSummary = async (_req, res) => {
  try {
    const [newCount, confirmedCount, processingCount, completedCount, cancelledCount, revenue] = await Promise.all([
      Order.countDocuments({ status: 'new' }),
      Order.countDocuments({ status: 'confirmed' }),
      Order.countDocuments({ status: 'processing' }),
      Order.countDocuments({ status: 'completed' }),
      Order.countDocuments({ status: 'cancelled' }),
      Order.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$totalPrice' } } }]),
    ]);
    res.json({ new: newCount, confirmed: confirmedCount, processing: processingCount, completed: completedCount, cancelled: cancelledCount, completedRevenue: revenue[0]?.total || 0 });
  } catch (error) {
    res.status(500).json({ message: 'Ringkasan order gagal dimuat', error: error.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { status, jenis } = req.query;
    const filter = {};
    if (['new', 'confirmed', 'processing', 'completed', 'cancelled'].includes(status)) filter.status = status;
    if (['joki', 'gift'].includes(jenis)) filter.jenis = jenis;
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(100).populate('product', 'nama jenis').lean();
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Daftar order gagal dimuat', error: error.message });
  }
};

exports.updateOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order tidak ditemukan' });

    const { status, paymentStatus } = req.body;
    if (status && status !== order.status) {
      if (!allowedStatuses[order.status]?.includes(status)) return res.status(409).json({ message: 'Perubahan status order tidak valid' });
      if (status === 'cancelled' && order.stockReserved) {
        await Product.updateOne({ _id: order.product }, { $inc: { stok: order.quantity } });
        order.stockReserved = false;
      }
      order.status = status;
    }
    if (paymentStatus) {
      if (!['unpaid', 'paid', 'refunded'].includes(paymentStatus)) return res.status(400).json({ message: 'Status pembayaran tidak valid' });
      order.paymentStatus = paymentStatus;
    }
    await order.save();
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Order gagal diperbarui', error: error.message });
  }
};

exports.trackOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ orderCode: req.params.orderCode.toUpperCase() })
      .select('orderCode jenis productName gameName quantity totalPrice status paymentStatus createdAt updatedAt');
    if (!order) return res.status(404).json({ message: 'Order tidak ditemukan' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Status order gagal dimuat', error: error.message });
  }
};
