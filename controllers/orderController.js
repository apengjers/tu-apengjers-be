const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Setting = require('../models/Setting');
const {
  sendDiscordOrderNotification,
  sendDiscordStockNotification,
} = require('../services/discordWebhookService');
const { PAYMENT_CHANNELS } = require('../services/midtransService');
const { encryptPassword, decryptPassword, normalizeWhatsapp } = require('../services/orderCredentials');

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
  let reservedProduct = null;

  try {
    const {
      jenis,
      productId,
      quantity: rawQuantity,
      robloxUsername,
      robloxPassword,
      recipientUsername,
      whatsapp,
      contactEmail,
      notes,
      requestedPaymentMethod,
      paymentChannel,
    } = req.body;

    const quantity = Number(rawQuantity);
    const normalizedWhatsapp = normalizeWhatsapp(whatsapp);
    if (!['joki', 'gift'].includes(jenis)) return res.status(400).json({ message: 'Jenis order tidak valid' });
    if (!mongoose.isValidObjectId(productId)) return res.status(400).json({ message: 'Produk tidak valid' });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return res.status(400).json({ message: 'Jumlah harus antara 1 sampai 99' });
    if (!normalizedWhatsapp) return res.status(400).json({ message: 'Gunakan nomor seluler Indonesia yang valid: 08…, 628…, atau +628… (10–13 digit dalam format 08).' });
    if (jenis === 'gift' && !String(recipientUsername || '').trim()) return res.status(400).json({ message: 'Username penerima wajib diisi' });
    if (jenis === 'joki' && (!String(robloxUsername || '').trim() || typeof robloxPassword !== 'string' || robloxPassword.length < 8 || robloxPassword.length > 200)) {
      return res.status(400).json({ message: 'Username dan password Roblox (8–200 karakter) wajib diisi' });
    }
    const orderCode = `AJ-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
    // Encrypt before reserving stock; missing key must never create an unfulfillable order.
    let robloxPasswordEncrypted;
    if (jenis === 'joki') {
      try { robloxPasswordEncrypted = encryptPassword(robloxPassword, orderCode); }
      catch { return res.status(503).json({ message: 'Penyimpanan kredensial belum dikonfigurasi. Hubungi admin.' }); }
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
      reservedProduct = reserved;
    } else if (jenis === 'gift') {
      return res.status(409).json({ message: 'Gift sedang habis' });
    }

    const paymentGroup = Object.keys(PAYMENT_CHANNELS).includes(requestedPaymentMethod) ? requestedPaymentMethod : undefined;
    const channel = paymentGroup && PAYMENT_CHANNELS[paymentGroup].includes(paymentChannel) ? paymentChannel : '';

    const order = await Order.create({
      user: req.user?._id,
      orderCode,
      jenis,
      product: product._id,
      game: product.game?._id,
      productName: product.nama,
      gameName: product.game?.nama || '',
      quantity,
      unitPrice: product.harga,
      totalPrice: product.harga * quantity,
      robloxUsername: String(robloxUsername || '').trim(),
      robloxPasswordEncrypted,
      recipientUsername: String(recipientUsername || '').trim(),
      whatsapp: normalizedWhatsapp,
      contactEmail: String(contactEmail || '').trim(),
      notes: String(notes || '').trim().slice(0, 1000),
      requestedPaymentMethod: paymentGroup,
      paymentChannel: channel,
      stockReserved: reservedStock,
    });

    // Trigger Discord Webhook (non-blocking agar tidak memperlambat response ke buyer)
    sendDiscordOrderNotification(order, 'ORDER_CREATED');

    // Notif stok habis (hanya kalau stok baru saja jadi 0 karena order ini)
    if (reservedProduct && reservedProduct.stok === 0) {
      sendDiscordStockNotification(reservedProduct);
    }

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
    console.error('Gagal membuat order:', error.name); // Never log validation payloads containing credentials.
    res.status(500).json({ message: 'Order belum berhasil disimpan' });
  }
};

exports.getOrderCredentials = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'ID order tidak valid' });
    const order = await Order.findById(req.params.id).select('orderCode status paymentStatus +robloxPasswordEncrypted');
    if (!order?.robloxPasswordEncrypted) return res.status(404).json({ message: 'Password tidak tersedia' });
    if (order.paymentStatus !== 'paid' || !['confirmed', 'processing'].includes(order.status)) {
      return res.status(409).json({ message: 'Password hanya tersedia untuk pesanan lunas yang sedang dikerjakan' });
    }
    res.json({ password: decryptPassword(order.robloxPasswordEncrypted, order.orderCode) });
  } catch {
    res.status(500).json({ message: 'Password gagal dibuka' });
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
    let isChanged = false;

    if (status && status !== order.status) {
      if (!allowedStatuses[order.status]?.includes(status)) return res.status(409).json({ message: 'Perubahan status order tidak valid' });
      if (status === 'cancelled' && order.stockReserved) {
        await Product.updateOne({ _id: order.product }, { $inc: { stok: order.quantity } });
        order.stockReserved = false;
      }
      order.status = status;
      isChanged = true;
    }
    if (paymentStatus && paymentStatus !== order.paymentStatus) {
      if (!['unpaid', 'paid', 'refunded'].includes(paymentStatus)) return res.status(400).json({ message: 'Status pembayaran tidak valid' });
      order.paymentStatus = paymentStatus;
      isChanged = true;
    }
    if (['completed', 'cancelled'].includes(order.status)) order.robloxPasswordEncrypted = undefined;
    await order.save();

    if (isChanged) {
      sendDiscordOrderNotification(order, 'ORDER_UPDATED');
    }

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

// --- ENDPOINT KONFIGURASI WEBHOOK DISCORD (ADMIN) ---

exports.getWebhookSetting = async (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    
    // Cek key baru dan key lama di database sekaligus
    const [notifSetting, legacySetting] = await Promise.all([
      Setting.findOne({ key: 'notification_settings' }).lean(),
      Setting.findOne({ key: 'discord_webhook_url' }).lean(),
    ]);

    const val = typeof notifSetting?.value === 'object' && notifSetting?.value !== null ? notifSetting.value : {};
    const legacyUrl = typeof legacySetting?.value === 'string' ? legacySetting.value : (legacySetting?.value?.webhookUrl || '');

    const webhookUrl = val.webhookUrl || legacyUrl || '';

    res.json({
      webhookUrl,
      emailChat: val.emailChat ?? true,
      emailEmptyStock: val.emailEmptyStock ?? true,
      discordNewOrder: val.discordNewOrder ?? true,
      discordOrderIssue: val.discordOrderIssue ?? true,
      discordEmptyStock: val.discordEmptyStock ?? true,
      discordChat: val.discordChat ?? false,
    });
  } catch (error) {
    console.error('[Webhook Error GET]:', error);
    res.status(500).json({ message: 'Gagal memuat konfigurasi notifikasi', error: error.message });
  }
};

exports.updateWebhookSetting = async (req, res) => {
  try {
    const webhookUrl = String(req.body.webhookUrl || '').trim();
    if (webhookUrl && !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      return res.status(400).json({ message: 'URL harus berupa Discord Webhook yang valid (https://discord.com/api/webhooks/...)' });
    }

    const payload = {
      webhookUrl,
      emailChat: Boolean(req.body.emailChat ?? true),
      emailEmptyStock: Boolean(req.body.emailEmptyStock ?? true),
      discordNewOrder: Boolean(req.body.discordNewOrder ?? true),
      discordOrderIssue: Boolean(req.body.discordOrderIssue ?? true),
      discordEmptyStock: Boolean(req.body.discordEmptyStock ?? true),
      discordChat: Boolean(req.body.discordChat ?? false),
    };

    const updated = await Setting.findOneAndUpdate(
      { key: 'notification_settings' },
      { value: payload },
      { upsert: true, new: true },
    );

    res.json({ message: 'Pengaturan notifikasi berhasil disimpan', ...updated.value });
  } catch (error) {
    res.status(500).json({ message: 'Gagal menyimpan konfigurasi notifikasi', error: error.message });
  }
};

exports.testWebhookSetting = async (req, res) => {
  try {
    const setting = await Setting.findOne({ key: 'notification_settings' }).lean();
    const savedUrl = setting?.value?.webhookUrl || '';
    const webhookUrl = String(req.body.webhookUrl || savedUrl).trim();

    if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      return res.status(400).json({ message: 'Masukkan URL Discord Webhook yang valid terlebih dahulu' });
    }

    const sampleContent = [
      `@everyone Halo **APENGJERS** berikut data pesanan terbaru untuk toko kamu:`,
      `* Pesanan baru masuk [AJ-TEST123456](http://localhost:5173/cek-transaksi) JOKI TREADMILL 1 JAM Joki Break and Steal an Egg`,
    ].join('\n');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: sampleContent }),
    });

    if (!response.ok) {
      return res.status(400).json({ message: 'Discord menolak webhook. Pastikan URL webhook masih aktif.' });
    }

    res.json({ message: 'Pesan test berhasil dikirim ke Discord!' });
  } catch (error) {
    res.status(500).json({ message: 'Gagal mengirim pesan test ke Discord', error: error.message });
  }
};

// ---- Riwayat transaksi milik user yang login ----
const TAB_FILTERS = {
  'menunggu-pembayaran': { paymentStatus: 'unpaid', status: { $in: ['new', 'confirmed', 'processing'] } },
  'menunggu-dikirim': { paymentStatus: 'paid', status: { $in: ['new', 'confirmed'] } },
  'sudah-terkirim': { paymentStatus: 'paid', status: 'processing' },
  selesai: { status: 'completed' },
  dibatalkan: { status: 'cancelled' },
};

// Order lama (belum punya field user) dicocokkan lewat email kontak
const ownerFilter = (user) => ({
  $or: [{ user: user._id }, { user: { $exists: false }, contactEmail: user.email }],
});

exports.getMyOrders = async (req, res) => {
  try {
    const { tab } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    const filter = { $and: [ownerFilter(req.user)] };
    if (tab) {
      if (!TAB_FILTERS[tab]) return res.status(400).json({ message: 'Tab tidak valid' });
      filter.$and.push(TAB_FILTERS[tab]);
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-user -notes -stockReserved')
        .lean(),
      Order.countDocuments(filter),
    ]);

    res.json({ orders, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Gagal memuat riwayat order:', error);
    res.status(500).json({ message: 'Riwayat transaksi gagal dimuat' });
  }
};

exports.getMyOrderCounts = async (req, res) => {
  try {
    const owner = ownerFilter(req.user);
    const entries = await Promise.all(
      Object.entries(TAB_FILTERS).map(async ([tab, f]) => [
        tab,
        await Order.countDocuments({ $and: [owner, f] }),
      ]),
    );
    res.json(Object.fromEntries(entries));
  } catch (error) {
    res.status(500).json({ message: 'Ringkasan riwayat gagal dimuat' });
  }
};

exports.getMyOrder = async (req, res) => {
  try {
    const order = await Order.findOne({
      $and: [ownerFilter(req.user), { orderCode: String(req.params.orderCode).toUpperCase() }],
    }).select('-user -stockReserved').lean();
    if (!order) return res.status(404).json({ message: 'Order tidak ditemukan' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Detail order gagal dimuat' });
  }
};
