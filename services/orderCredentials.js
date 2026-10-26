const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function loadLocalKey(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return fs.readFileSync(file, 'utf8').trim();
}

function encryptionKey() {
  let value = process.env.ORDER_CREDENTIALS_KEY || '';
  // Local demos retain one key across restarts; production must provide its own secret.
  if (!value && process.env.NODE_ENV !== 'production') {
    value = loadLocalKey(path.join(__dirname, '..', '.local', 'order-credentials.key'));
  }
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new Error('ORDER_CREDENTIALS_KEY harus berupa 32 byte hex');
  return Buffer.from(value, 'hex');
}

function encryptPassword(password, orderCode) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(orderCode));
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
}

function decryptPassword(value, orderCode) {
  const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAAD(Buffer.from(orderCode));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function normalizeWhatsapp(value) {
  if (typeof value !== 'string' || !/^[+\d\s()-]+$/.test(value)) return null;
  let digits = value.replace(/[\s()-]/g, '');
  if (digits.startsWith('08')) digits = `+62${digits.slice(1)}`;
  else if (digits.startsWith('628')) digits = `+${digits}`;
  // Indonesian mobile format only; this does not verify ownership or active WhatsApp registration.
  return /^\+628[1-9]\d{7,10}$/.test(digits) ? digits : null;
}

module.exports = { encryptPassword, decryptPassword, normalizeWhatsapp, loadLocalKey };
