const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { encryptPassword, decryptPassword, normalizeWhatsapp, loadLocalKey } = require('../services/orderCredentials');

test('normalizes Indonesian mobile numbers and rejects invalid input', () => {
  for (const value of ['081234567890', '6281234567890', '+62 812-3456-7890']) assert.equal(normalizeWhatsapp(value), '+6281234567890');
  for (const value of ['', '12345', '+12025550123', '02112345678', '08123abc456789', '080123456789', '0812345678901234', null]) assert.equal(normalizeWhatsapp(value), null);
});

test('password encryption is randomized, authenticated and bound to an order', () => {
  const previous = process.env.ORDER_CREDENTIALS_KEY;
  const previousEnv = process.env.NODE_ENV;
  try {
    process.env.ORDER_CREDENTIALS_KEY = 'ab'.repeat(32);
    const password = ' temporary password ';
    const value = encryptPassword(password, 'AJ-ONE');
    assert.notEqual(value, encryptPassword(password, 'AJ-ONE'));
    assert.ok(!value.includes(password));
    assert.equal(decryptPassword(value, 'AJ-ONE'), password);
    assert.throws(() => decryptPassword(value, 'AJ-TWO'));
    const parts = value.split('.');
    parts[2] = Buffer.from('tampered ciphertext').toString('base64');
    assert.throws(() => decryptPassword(parts.join('.'), 'AJ-ONE'));
    process.env.ORDER_CREDENTIALS_KEY = '';
    process.env.NODE_ENV = 'production';
    assert.throws(() => encryptPassword(password, 'AJ-ONE'), /ORDER_CREDENTIALS_KEY/);
  } finally {
    if (previous === undefined) delete process.env.ORDER_CREDENTIALS_KEY;
    else process.env.ORDER_CREDENTIALS_KEY = previous;
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
});

test('local demo key is generated once, survives reloads and never overwrites an existing key', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'apeng-credentials-'));
  const file = path.join(directory, '.local', 'order-credentials.key');
  try {
    const key = loadLocalKey(file);
    assert.match(key, /^[a-f0-9]{64}$/);
    assert.equal(loadLocalKey(file), key);
    fs.writeFileSync(file, 'invalid-existing-key');
    assert.equal(loadLocalKey(file), 'invalid-existing-key');
  } finally {
    fs.unlinkSync(file);
    fs.rmdirSync(path.dirname(file));
    fs.rmdirSync(directory);
  }
});
