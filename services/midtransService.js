const crypto = require('node:crypto');

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
const SNAP_URL = isProduction
  ? 'https://app.midtrans.com/snap/v1/transactions'
  : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
const API_URL = isProduction
  ? 'https://api.midtrans.com/v2'
  : 'https://api.sandbox.midtrans.com/v2';

// Grup metode bayar -> channel Snap (enabled_payments). Nilai sudah dicek ke dokumentasi Midtrans.
// echannel = Mandiri Bill Payment.
const PAYMENT_CHANNELS = {
  qris: ['other_qris'],
  va: ['bca_va', 'echannel', 'bni_va', 'bri_va', 'permata_va'],
  ewallet: ['gopay', 'shopeepay'],
};
exports.PAYMENT_CHANNELS = PAYMENT_CHANNELS;

// Batas waktu bayar (menit). Setelah lewat, Midtrans kirim notif "expire" lalu order dibatalkan & stok dikembalikan.
const PAYMENT_EXPIRY_MINUTES = Number(process.env.MIDTRANS_EXPIRY_MINUTES) || 60;

const getServerKey = () => {
  const key = process.env.MIDTRANS_SERVER || process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error('MIDTRANS_SERVER belum diset di .env');
  return key;
};

const authHeader = () => `Basic ${Buffer.from(`${getServerKey()}:`).toString('base64')}`;

exports.createSnapTransaction = async (order) => {
  const customerName = order.displayName || order.robloxUsername || order.recipientUsername || 'Customer';

  // Batasi metode yang muncul di popup sesuai pilihan buyer (kosong = tampilkan semua)
  const channels = order.paymentChannel ? [order.paymentChannel] : PAYMENT_CHANNELS[order.requestedPaymentMethod];

  const payload = {
    transaction_details: {
      order_id: order.orderCode,
      gross_amount: order.totalPrice,
    },
    item_details: [
      {
        id: String(order.product),
        price: order.unitPrice,
        quantity: order.quantity,
        name: `${order.productName}${order.gameName ? ` - ${order.gameName}` : ''}`.slice(0, 50),
      },
    ],
    customer_details: {
      first_name: customerName.slice(0, 255),
      phone: order.whatsapp,
      ...(order.contactEmail ? { email: order.contactEmail } : {}),
    },
    expiry: { unit: 'minutes', duration: PAYMENT_EXPIRY_MINUTES },
    ...(channels ? { enabled_payments: channels } : {}),
    // Setelah bayar, Midtrans mengembalikan buyer ke sini (+ query order_id, status_code, transaction_status)
    callbacks: { finish: `${FRONTEND_URL}/cek-transaksi?orderCode=${encodeURIComponent(order.orderCode)}` },
  };

  console.log(`[Midtrans] ${order.orderCode} enabled_payments:`, channels ? channels.join(', ') : 'semua');

  const response = await fetch(SNAP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: authHeader(),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Midtrans Snap ${response.status}: ${JSON.stringify(data.error_messages || data)}`);
  }
  return data; // { token, redirect_url }
};

// Ambil status transaksi langsung dari Midtrans (sumber kebenaran).
exports.getTransactionStatus = async (orderCode) => {
  const response = await fetch(`${API_URL}/${encodeURIComponent(orderCode)}/status`, {
    headers: { Accept: 'application/json', Authorization: authHeader() },
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  // Midtrans balas HTTP 200 dengan status_code "404" di body kalau transaksi belum ada.
  if (String(data.status_code) === '404') return null;
  if (!response.ok || !data.order_id || !data.transaction_status) throw new Error(`Midtrans status ${response.status}: ${JSON.stringify(data)}`);
  return data;
};

// SHA512(order_id + status_code + gross_amount + ServerKey)
exports.verifySignature = (body) => {
  const { order_id, status_code, gross_amount, signature_key } = body || {};
  if (!order_id || !status_code || !gross_amount || !signature_key) return false;

  const expected = crypto
    .createHash('sha512')
    .update(`${order_id}${status_code}${gross_amount}${getServerKey()}`)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature_key));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
