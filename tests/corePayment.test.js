const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { buildChargePayload, normalizePayment, createCoreTransaction } = require('../services/corePaymentService');
const { getTransactionStatus } = require('../services/midtransService');

const order = {
  orderCode: 'AJ-1234567890', totalPrice: 15000, whatsapp: '+628123456789',
  displayName: 'Buyer', requestedPaymentMethod: 'qris', paymentChannel: 'other_qris',
};
const originalFetch = global.fetch;
const originalKey = process.env.MIDTRANS_SERVER;
afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.MIDTRANS_SERVER;
  else process.env.MIDTRANS_SERVER = originalKey;
});

test('maps every checkout channel to the correct Core API payload', () => {
  const cases = [
    ['qris', 'other_qris', 'qris'], ['va', 'bca_va', 'bank_transfer'],
    ['va', 'bni_va', 'bank_transfer'], ['va', 'bri_va', 'bank_transfer'],
    ['va', 'permata_va', 'bank_transfer'], ['va', 'echannel', 'echannel'],
    ['ewallet', 'gopay', 'gopay'], ['ewallet', 'shopeepay', 'shopeepay'],
  ];
  for (const [requestedPaymentMethod, paymentChannel, type] of cases) {
    const payload = buildChargePayload({ ...order, requestedPaymentMethod, paymentChannel });
    assert.equal(payload.payment_type, type);
    assert.equal(payload.transaction_details.gross_amount, order.totalPrice);
    assert.equal(payload.transaction_details.order_id, order.orderCode);
    if (type === 'bank_transfer') assert.equal(payload.bank_transfer.bank, paymentChannel.replace('_va', ''));
    if (type === 'gopay' || type === 'shopeepay') {
      const callback = new URL(payload[type].callback_url);
      assert.equal(callback.pathname, '/cek-transaksi');
      assert.equal(callback.searchParams.get('orderCode'), order.orderCode);
    }
  }
});

test('rejects unsupported channels and invalid amounts', () => {
  assert.throws(() => buildChargePayload({ ...order, paymentChannel: 'bca_va' }), /Metode/);
  for (const totalPrice of [0, -1, 1.5, NaN, Infinity, '15000']) {
    assert.throws(() => buildChargePayload({ ...order, totalPrice }), /Nominal/);
  }
});

test('normalizes provider instructions without exposing PII or unsafe links', () => {
  const payment = normalizePayment({
    payment_type: 'qris', transaction_id: 'trx', transaction_status: 'pending',
    expiry_time: '2026-10-26 15:00:00', customer_details: { email: 'private@example.com' },
    actions: [{ name: 'generate-qr-code', url: 'https://api.sandbox.midtrans.com/qr' }, { name: 'deeplink-redirect', url: 'javascript:alert(1)' }],
    va_numbers: [{ bank: 'bca', va_number: '123456789' }], permata_va_number: '987', bill_key: '123', biller_code: '70012',
  });
  assert.equal(payment.expiresAt, '2026-10-26T15:00:00+07:00');
  assert.equal(payment.qrUrl, 'https://api.sandbox.midtrans.com/qr');
  assert.equal(payment.deeplinkUrl, '');
  assert.deepEqual(payment.vaNumbers, [{ bank: 'bca', number: '123456789' }]);
  assert.equal(payment.permataVaNumber, '987');
  assert.equal(payment.billKey, '123');
  assert.equal(payment.billerCode, '70012');
  assert.equal(payment.customer_details, undefined);
  assert.equal(normalizePayment({ expire_time: '2026-10-26T08:00:00Z' }).expiresAt, '2026-10-26T08:00:00Z');
});

test('charge sends server-authenticated amounts and rejects provider errors inside HTTP 200', async () => {
  process.env.MIDTRANS_SERVER = 'test-server-key';
  global.fetch = async (url, options) => {
    assert.match(url, /\/v2\/charge$/);
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from('test-server-key:').toString('base64')}`);
    assert.equal(JSON.parse(options.body).transaction_details.gross_amount, 15000);
    return { ok: true, json: async () => ({ status_code: '406', status_message: 'Duplicate order ID' }) };
  };
  await assert.rejects(createCoreTransaction(order), /406/);
});

test('status distinguishes missing transactions from provider failures', async () => {
  process.env.MIDTRANS_SERVER = 'test-server-key';
  global.fetch = async () => ({ ok: true, json: async () => ({ status_code: '404' }) });
  assert.equal(await getTransactionStatus(order.orderCode), null);
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ status_code: '401' }) });
  await assert.rejects(getTransactionStatus(order.orderCode), /Midtrans status/);
});
