const { PAYMENT_CHANNELS } = require('./midtransService');

const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
const apiUrl = () => process.env.MIDTRANS_IS_PRODUCTION === 'true'
  ? 'https://api.midtrans.com/v2' : 'https://api.sandbox.midtrans.com/v2';

function buildChargePayload(order) {
  const group = order.requestedPaymentMethod === 'bank' ? 'va' : order.requestedPaymentMethod;
  const channel = order.paymentChannel || PAYMENT_CHANNELS[group]?.[0];
  if (!PAYMENT_CHANNELS[group]?.includes(channel)) throw new Error('Metode pembayaran order tidak valid');
  if (!Number.isSafeInteger(order.totalPrice) || order.totalPrice <= 0) throw new Error('Nominal pembayaran tidak valid');
  const callbackUrl = `${frontendUrl()}/cek-transaksi?orderCode=${encodeURIComponent(order.orderCode)}`;
  const payload = {
    transaction_details: { order_id: order.orderCode, gross_amount: order.totalPrice },
    customer_details: {
      first_name: (order.displayName || order.robloxUsername || order.recipientUsername || 'Customer').slice(0, 255),
      phone: order.whatsapp,
      ...(order.contactEmail ? { email: order.contactEmail } : {}),
    },
    custom_expiry: { expiry_duration: Number(process.env.MIDTRANS_EXPIRY_MINUTES) || 60, unit: 'minute' },
  };
  if (channel === 'other_qris') {
    Object.assign(payload, { payment_type: 'qris', qris: { acquirer: 'gopay' } });
  } else if (channel === 'echannel') {
    Object.assign(payload, { payment_type: 'echannel', echannel: { bill_info1: 'Pembayaran', bill_info2: 'ApengJers' } });
  } else if (channel.endsWith('_va')) {
    Object.assign(payload, { payment_type: 'bank_transfer', bank_transfer: { bank: channel.replace('_va', '') } });
  } else if (channel === 'gopay') {
    Object.assign(payload, { payment_type: 'gopay', gopay: { enable_callback: true, callback_url: callbackUrl } });
  } else if (channel === 'shopeepay') {
    Object.assign(payload, { payment_type: 'shopeepay', shopeepay: { callback_url: callbackUrl } });
  }
  return payload;
}

// Only provider-issued HTTPS links reach the browser; never forward arbitrary action schemes.
function paymentUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function normalizePayment(trx) {
  const actions = Array.isArray(trx.actions) ? trx.actions : [];
  const actionUrl = (name) => paymentUrl(actions.find((action) => action.name === name)?.url);
  // Midtrans timestamps without an offset use WIB (UTC+7).
  const expiresAt = trx.expiry_time || trx.expire_time;
  return {
    paymentType: trx.payment_type || '',
    transactionId: trx.transaction_id || '',
    transactionStatus: trx.transaction_status || '',
    vaNumbers: (trx.va_numbers || []).map(({ bank, va_number }) => ({ bank, number: va_number })),
    permataVaNumber: trx.permata_va_number || '',
    billKey: trx.bill_key || '',
    billerCode: trx.biller_code || '',
    qrUrl: actionUrl('generate-qr-code'),
    deeplinkUrl: actionUrl('deeplink-redirect'),
    expiresAt: expiresAt ? (/[Zz]|[+-]\d{2}:?\d{2}$/.test(expiresAt) ? expiresAt : `${expiresAt.replace(' ', 'T')}+07:00`) : null,
  };
}

async function createCoreTransaction(order) {
  const key = process.env.MIDTRANS_SERVER || process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error('MIDTRANS_SERVER belum diset');
  const response = await fetch(`${apiUrl()}/charge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
    },
    body: JSON.stringify(buildChargePayload(order)),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok || !['200', '201', '202'].includes(String(data.status_code))) {
    throw new Error(`Midtrans charge ${data.status_code || response.status}: ${data.status_message || 'gagal'}`);
  }
  return data;
}

module.exports = { buildChargePayload, normalizePayment, createCoreTransaction };
