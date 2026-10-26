const Order = require('../models/Order');
const Product = require('../models/Product');
const { createSnapTransaction, getTransactionStatus, verifySignature } = require('../services/midtransService');
const { sendDiscordOrderNotification } = require('../services/discordWebhookService');
const { createCoreTransaction, normalizePayment } = require('../services/corePaymentService');

// Semua perubahan status pakai update atomik + kondisi, jadi aman kalau Midtrans
// kirim notifikasi dobel / berbarengan dengan sync dari FE (idempotent).

async function markPaid(order, trx) {
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: 'unpaid' },
    {
      paymentStatus: 'paid',
      paidAt: new Date(),
      midtransTransactionId: trx.transaction_id || '',
      paymentType: trx.payment_type || '',
    },
    { new: true },
  );
  if (!claimed) return null; // sudah pernah diproses

  await Order.updateOne({ _id: order._id, status: 'new' }, { status: 'confirmed' });
  const fresh = await Order.findById(order._id);

  if (fresh.status === 'cancelled') {
    // Uang masuk tapi order sudah dibatalkan -> perlu refund manual
    console.warn(`[Midtrans] Order ${fresh.orderCode} sudah cancelled tapi pembayaran masuk. Perlu refund manual.`);
  }
  sendDiscordOrderNotification(fresh, 'ORDER_PAID');
  return fresh;
}

async function cancelUnpaid(order) {
  const before = await Order.findOneAndUpdate(
    { _id: order._id, status: 'new', paymentStatus: 'unpaid' },
    { $set: { status: 'cancelled', stockReserved: false }, $unset: { robloxPasswordEncrypted: 1 } },
    { new: false },
  );
  if (!before) return null;

  if (before.stockReserved) {
    await Product.updateOne({ _id: before.product }, { $inc: { stok: before.quantity } });
  }
  const fresh = await Order.findById(order._id);
  sendDiscordOrderNotification(fresh, 'ORDER_UPDATED');
  return fresh;
}

async function applyTransactionStatus(order, trx) {
  if (trx.order_id !== order.orderCode) throw new Error('ID transaksi tidak cocok');
  if (Number(trx.gross_amount) !== Number(order.totalPrice)) {
    console.error(`[Midtrans] Nominal tidak cocok untuk ${order.orderCode}: ${trx.gross_amount} vs ${order.totalPrice}`);
    return;
  }

  const status = trx.transaction_status;
  const fraud = trx.fraud_status;

  if (status === 'capture' || status === 'settlement') {
    if (fraud && fraud !== 'accept') return; // challenge -> tunggu review manual di dashboard Midtrans
    await markPaid(order, trx);
  } else if (['deny', 'cancel', 'expire', 'failure'].includes(status)) {
    await cancelUnpaid(order);
  } else if (['refund', 'partial_refund', 'chargeback'].includes(status)) {
    await Order.updateOne({ _id: order._id, paymentStatus: 'paid' }, { paymentStatus: 'refunded' });
  }
  // 'pending' -> belum ada yang perlu diubah
}

// Core API checkout; order codes are unguessable bearer links. No customer PII in this response.
exports.createPayment = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const orderCode = String(req.body.orderCode || '').trim().toUpperCase();
  if (!/^AJ-[A-Z0-9]{6,64}$/.test(orderCode)) return res.status(400).json({ message: 'ID order tidak valid' });
  let claimed;
  try {
    let order = await Order.findOne({ orderCode });
    if (!order) return res.status(404).json({ message: 'Order tidak ditemukan' });
    const reply = (current, payment) => res.json({
      order: {
        orderCode: current.orderCode, productName: current.productName, gameName: current.gameName,
        quantity: current.quantity, totalPrice: current.totalPrice, status: current.status,
        paymentStatus: current.paymentStatus, paymentChannel: current.paymentChannel,
      },
      payment,
    });
    if (order.status !== 'new' || order.paymentStatus !== 'unpaid') return reply(order, null);
    if (order.snapToken) return res.status(409).json({ message: 'Order lama ini sudah memakai pembayaran Snap. Lanjutkan transaksi sebelumnya atau hubungi admin; jangan buat pembayaran ganda.' });
    if (order.paymentDetails) return reply(order, order.paymentDetails);

    // Atomic lease prevents two tabs/workers charging the same order at once.
    claimed = await Order.findOneAndUpdate({
      _id: order._id, status: 'new', paymentStatus: 'unpaid', paymentDetails: null,
      $or: [{ paymentCreatingAt: null }, { paymentCreatingAt: { $lt: new Date(Date.now() - 60000) } }],
    }, { paymentCreatingAt: new Date() }, { new: true });
    if (!claimed) return res.status(409).json({ message: 'Pembayaran sedang disiapkan. Coba lagi sebentar.' });

    // Recover a charge accepted before a timeout or DB failure, instead of charging again.
    let trx = await getTransactionStatus(orderCode);
    if (!trx) {
      try { trx = await createCoreTransaction(claimed); }
      catch (error) {
        trx = await getTransactionStatus(orderCode);
        if (!trx) throw error;
      }
    }
    if (trx.order_id !== orderCode || Number(trx.gross_amount) !== Number(claimed.totalPrice)) {
      throw new Error('Data transaksi Midtrans tidak cocok');
    }
    const payment = normalizePayment(trx);
    await Order.updateOne({ _id: claimed._id }, {
      paymentDetails: payment, paymentType: trx.payment_type,
      midtransTransactionId: trx.transaction_id,
    });
    await applyTransactionStatus(claimed, trx);
    order = await Order.findById(claimed._id);
    return reply(order, payment);
  } catch (error) {
    console.error('Gagal menyiapkan pembayaran custom:', error.message);
    return res.status(502).json({ message: 'Pembayaran belum bisa disiapkan. Coba lagi atau hubungi admin jika metode ini belum aktif.' });
  } finally {
    if (claimed) await Order.updateOne({ _id: claimed._id, paymentCreatingAt: claimed.paymentCreatingAt }, { paymentCreatingAt: null }).catch((error) => console.error('Gagal melepas payment lock:', error.message));
  }
};

// POST /api/payments/snap  { orderCode }  -> { token, redirectUrl }
exports.createSnapToken = async (req, res) => {
  try {
    const orderCode = String(req.body.orderCode || '').trim().toUpperCase();
    const order = await Order.findOne({ orderCode });
    if (!order) return res.status(404).json({ message: 'Order tidak ditemukan' });
    if (order.status !== 'new' || order.paymentStatus !== 'unpaid') {
      return res.status(409).json({ message: 'Order ini tidak bisa dibayar' });
    }
    if (order.paymentDetails || order.paymentCreatingAt) return res.status(409).json({ message: 'Order ini memakai halaman pembayaran ApengJers' });

    // Token sudah pernah dibuat -> pakai lagi (order_id Midtrans tidak boleh dobel)
    if (order.snapToken) return res.json({ token: order.snapToken, redirectUrl: order.snapRedirectUrl });

    const snap = await createSnapTransaction(order);
    order.snapToken = snap.token;
    order.snapRedirectUrl = snap.redirect_url;
    await order.save();

    res.json({ token: snap.token, redirectUrl: snap.redirect_url });
  } catch (error) {
    console.error('Gagal membuat Snap token:', error.message);
    res.status(502).json({ message: 'Gagal membuat transaksi pembayaran' });
  }
};

// POST /api/payments/midtrans/notification  (dipanggil server Midtrans)
exports.handleNotification = async (req, res) => {
  try {
    if (!verifySignature(req.body)) return res.status(403).json({ message: 'Signature tidak valid' });

    const order = await Order.findOne({ orderCode: req.body.order_id });
    if (!order) return res.status(200).json({ message: 'Order tidak ditemukan, diabaikan' });

    // Konfirmasi ulang langsung ke Midtrans, jangan percaya body mentah
    const trx = await getTransactionStatus(order.orderCode);
    if (!trx) return res.status(200).json({ message: 'Transaksi belum ada, diabaikan' });

    await applyTransactionStatus(order, trx);
    res.status(200).json({ message: 'OK' });
  } catch (error) {
    console.error('Gagal memproses notifikasi Midtrans:', error.message);
    res.status(500).json({ message: 'Gagal memproses notifikasi' }); // 500 -> Midtrans akan retry
  }
};

// GET /api/payments/status/:orderCode  -> sinkron status dari Midtrans (dipanggil FE setelah popup ditutup)
// Berguna juga di localhost saat notifikasi Midtrans belum bisa masuk.
exports.syncStatus = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const order = await Order.findOne({ orderCode: String(req.params.orderCode).toUpperCase() });
    if (!order) return res.status(404).json({ message: 'Order tidak ditemukan' });

    const trx = await getTransactionStatus(order.orderCode);
    if (trx) await applyTransactionStatus(order, trx);

    const fresh = await Order.findById(order._id).select('orderCode status paymentStatus');
    res.json({ orderCode: fresh.orderCode, status: fresh.status, paymentStatus: fresh.paymentStatus });
  } catch (error) {
    console.error('Gagal sinkron status pembayaran:', error.message);
    res.status(502).json({ message: 'Gagal mengecek status pembayaran' });
  }
};
