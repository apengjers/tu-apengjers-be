const Voucher = require('../models/Voucher');
const Product = require('../models/Product');
const Game = require('../models/Game');
const VoucherUsage = require('../models/VoucherUsage');

const trialVouchers = [
  {
    code: 'HEMAT10',
    title: 'Hemat 10%',
    description: 'Diskon 10% hingga Rp15.000 untuk pembelian minimal Rp25.000.',
    discountType: 'percent',
    discountValue: 10,
    maxDiscount: 15000,
    minimumPurchase: 25000,
    oneUsePerUser: true,
  },
  {
    code: 'WELCOME5K',
    title: 'Welcome Rp5.000',
    description: 'Potongan Rp5.000 untuk pembelian minimal Rp50.000.',
    discountType: 'fixed',
    discountValue: 5000,
    minimumPurchase: 50000,
    oneUsePerUser: true,
  },
];

async function ensureTrialVouchers() {
  await Promise.all(trialVouchers.map((voucher) => Voucher.updateOne(
    { code: voucher.code },
    { $setOnInsert: voucher },
    { upsert: true },
  )));
}

function isCurrentlyAvailable(voucher, now = new Date()) {
  return voucher.active && voucher.startsAt <= now && (!voucher.expiresAt || voucher.expiresAt >= now);
}

function calculateDiscount(voucher, subtotal) {
  if (subtotal < voucher.minimumPurchase) return 0;
  const rawDiscount = voucher.discountType === 'percent'
    ? Math.floor(subtotal * voucher.discountValue / 100)
    : voucher.discountValue;
  return Math.max(0, Math.min(subtotal, voucher.maxDiscount ? Math.min(rawDiscount, voucher.maxDiscount) : rawDiscount));
}

function getEligibilityMessage(voucher, product) {
  if (voucher.scope === 'joki' && product.jenis !== 'joki') return 'Voucher ini hanya berlaku untuk produk Joki Roblox.';
  if (voucher.scope === 'gift' && product.jenis !== 'gift') return 'Voucher ini hanya berlaku untuk produk Gift Item.';
  if (voucher.scope === 'game') {
    const productGameId = String(product.game?._id || product.game || '');
    if (!voucher.eligibleGames.some((gameId) => String(gameId) === productGameId)) {
      return 'Voucher ini tidak berlaku untuk game yang dipilih.';
    }
  }
  return '';
}

function normalizeWhatsappIdentity(whatsapp) {
  let digits = String(whatsapp || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) return `phone:62${digits.slice(1)}`;
  if (digits.startsWith('62')) return `phone:${digits}`;
  if (digits.startsWith('8')) return `phone:62${digits}`;
  return digits ? `phone:${digits}` : '';
}

function getUsageIdentities(whatsapp, userId) {
  const normalizedUserId = String(userId || '').trim();
  const phoneIdentity = normalizeWhatsappIdentity(whatsapp);
  return {
    phoneIdentity,
    userIdentity: normalizedUserId ? `user:${normalizedUserId}` : '',
  };
}

function hasMatchingIdentity(usage, identities) {
  const filters = [];
  if (identities.phoneIdentity) filters.push({ identity: identities.phoneIdentity });
  if (identities.userIdentity) filters.push({ userIdentity: identities.userIdentity });
  return VoucherUsage.exists({ voucher: usage, $or: filters });
}

exports.listAvailable = async (_req, res) => {
  try {
    await ensureTrialVouchers();
    const now = new Date();
    const vouchers = await Voucher.find({ active: true, startsAt: { $lte: now }, $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] })
      .select('code title description discountType discountValue maxDiscount minimumPurchase expiresAt scope eligibleGames oneUsePerUser')
      .populate('eligibleGames', 'nama')
      .sort({ minimumPurchase: 1 })
      .lean();
    res.json(vouchers);
  } catch (error) {
    console.error('Gagal memuat voucher:', error);
    res.status(500).json({ message: 'Daftar promo gagal dimuat' });
  }
};

exports.listForAdmin = async (_req, res) => {
  try {
    await ensureTrialVouchers();
    res.json(await Voucher.find().populate('eligibleGames', 'nama jenis').sort({ createdAt: -1 }).lean());
  } catch (error) {
    console.error('Gagal memuat voucher admin:', error);
    res.status(500).json({ message: 'Daftar voucher gagal dimuat' });
  }
};

function buildVoucherPayload(body) {
  const code = String(body.code || '').trim().toUpperCase();
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const discountType = body.discountType;
  const discountValue = Number(body.discountValue);
  const minimumPurchase = Number(body.minimumPurchase || 0);
  const scope = body.scope || 'all';
  const eligibleGames = Array.isArray(body.eligibleGames) ? body.eligibleGames.map((id) => String(id)) : [];
  const oneUsePerUser = body.oneUsePerUser !== false;
  const maxDiscount = body.maxDiscount === '' || body.maxDiscount === null || body.maxDiscount === undefined
    ? undefined
    : Number(body.maxDiscount);
  const startsAt = body.startsAt ? new Date(`${body.startsAt}T00:00:00`) : new Date();
  const expiresAt = body.expiresAt ? new Date(`${body.expiresAt}T23:59:59.999`) : undefined;

  if (!/^[A-Z0-9-]{3,24}$/.test(code)) throw new Error('Kode harus 3–24 karakter, hanya huruf, angka, atau tanda hubung.');
  if (!title || title.length > 80) throw new Error('Nama promo wajib diisi (maksimal 80 karakter).');
  if (description.length > 240) throw new Error('Deskripsi maksimal 240 karakter.');
  if (!['percent', 'fixed'].includes(discountType)) throw new Error('Jenis diskon tidak valid.');
  if (!['all', 'joki', 'gift', 'game'].includes(scope)) throw new Error('Cakupan voucher tidak valid.');
  if (scope === 'game' && (!eligibleGames.length || eligibleGames.some((id) => !/^[a-f\d]{24}$/i.test(id)))) {
    throw new Error('Pilih setidaknya satu game yang berlaku untuk voucher ini.');
  }
  if (!Number.isFinite(discountValue) || discountValue <= 0 || (discountType === 'percent' && discountValue > 100)) {
    throw new Error(discountType === 'percent' ? 'Diskon persen harus antara 1 sampai 100.' : 'Nilai diskon harus lebih dari 0.');
  }
  if (!Number.isFinite(minimumPurchase) || minimumPurchase < 0) throw new Error('Minimum belanja tidak valid.');
  if (maxDiscount !== undefined && (!Number.isFinite(maxDiscount) || maxDiscount <= 0)) throw new Error('Batas diskon tidak valid.');
  if (discountType === 'fixed' && maxDiscount !== undefined) throw new Error('Batas diskon hanya berlaku untuk diskon persen.');
  if (Number.isNaN(startsAt.getTime()) || (expiresAt && Number.isNaN(expiresAt.getTime()))) throw new Error('Tanggal promo tidak valid.');
  if (expiresAt && expiresAt < startsAt) throw new Error('Tanggal berakhir harus setelah tanggal mulai.');

  return {
    code,
    title,
    description,
    discountType,
    discountValue,
    maxDiscount,
    minimumPurchase,
    scope,
    eligibleGames: scope === 'game' ? eligibleGames : [],
    oneUsePerUser,
    startsAt,
    expiresAt,
  };
}

async function validateEligibleGames(payload) {
  if (payload.scope !== 'game') return;
  const matchingGames = await Game.countDocuments({ _id: { $in: payload.eligibleGames } });
  if (matchingGames !== payload.eligibleGames.length) throw new Error('Satu atau beberapa game yang dipilih tidak ditemukan.');
}

exports.create = async (req, res) => {
  try {
    const payload = buildVoucherPayload(req.body);
    await validateEligibleGames(payload);
    const voucher = await Voucher.create({ ...payload, active: req.body.active !== false });
    res.status(201).json(voucher);
  } catch (error) {
    const duplicateCode = error.code === 11000;
    res.status(duplicateCode ? 409 : 400).json({
      message: duplicateCode ? 'Kode voucher sudah digunakan.' : error.message || 'Voucher gagal dibuat.',
    });
  }
};

exports.update = async (req, res) => {
  try {
    const payload = buildVoucherPayload(req.body);
    await validateEligibleGames(payload);
    const update = {
      $set: { ...payload, active: req.body.active !== false },
      ...(payload.maxDiscount === undefined ? { $unset: { maxDiscount: 1 } } : {}),
    };
    const voucher = await Voucher.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true },
    );
    if (!voucher) return res.status(404).json({ message: 'Voucher tidak ditemukan.' });
    res.json(voucher);
  } catch (error) {
    const duplicateCode = error.code === 11000;
    res.status(duplicateCode ? 409 : 400).json({
      message: duplicateCode ? 'Kode voucher sudah digunakan.' : error.message || 'Voucher gagal diperbarui.',
    });
  }
};

exports.setActive = async (req, res) => {
  try {
    const voucher = await Voucher.findByIdAndUpdate(req.params.id, { active: Boolean(req.body.active) }, { new: true, runValidators: true });
    if (!voucher) return res.status(404).json({ message: 'Voucher tidak ditemukan.' });
    res.json(voucher);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Status voucher gagal diperbarui.' });
  }
};

exports.validate = async (req, res) => {
  try {
    await ensureTrialVouchers();
    const code = String(req.body.code || '').trim().toUpperCase();
    const subtotal = Number(req.body.subtotal);
    const productId = String(req.body.productId || '');
    if (!code || !Number.isFinite(subtotal) || subtotal < 0 || !/^[a-f\d]{24}$/i.test(productId)) {
      return res.status(400).json({ message: 'Pilih produk dan masukkan kode promo yang valid.' });
    }

    const product = await Product.findById(productId).populate('game', 'nama');
    if (!product) return res.status(404).json({ message: 'Produk tidak ditemukan.' });

    const voucher = await Voucher.findOne({ code });
    if (!voucher || !isCurrentlyAvailable(voucher)) {
      return res.status(404).json({ message: 'Kode promo tidak ditemukan atau sudah tidak berlaku.' });
    }
    if (subtotal < voucher.minimumPurchase) {
      return res.status(400).json({ message: `Minimum pembelian untuk promo ini ${voucher.minimumPurchase}.` });
    }
    const eligibilityMessage = getEligibilityMessage(voucher, product);
    if (eligibilityMessage) return res.status(400).json({ message: eligibilityMessage });
    if (voucher.oneUsePerUser) {
      const identities = getUsageIdentities(req.body.whatsapp, req.user?._id);
      if (!identities.phoneIdentity) return res.status(400).json({ message: 'Masukkan nomor WhatsApp untuk memeriksa batas penggunaan voucher.' });
      const alreadyUsed = await hasMatchingIdentity(voucher._id, identities);
      if (alreadyUsed) return res.status(409).json({ message: 'Voucher hanya dapat digunakan 1x per user.' });
    }

    res.json({
      code: voucher.code,
      title: voucher.title,
      discountAmount: calculateDiscount(voucher, subtotal),
      totalAfterDiscount: Math.max(0, subtotal - calculateDiscount(voucher, subtotal)),
    });
  } catch (error) {
    console.error('Gagal memvalidasi voucher:', error);
    res.status(500).json({ message: 'Kode promo gagal diperiksa' });
  }
};

exports.findValidForSubtotal = async (code, subtotal, product, whatsapp, userId) => {
  if (!code) return { voucherCode: '', discountAmount: 0 };
  await ensureTrialVouchers();
  const voucher = await Voucher.findOne({ code: String(code).trim().toUpperCase() });
  if (!voucher || !isCurrentlyAvailable(voucher)) {
    const error = new Error('Kode promo sudah tidak berlaku. Periksa kembali ringkasan order.');
    error.status = 400;
    throw error;
  }
  if (subtotal < voucher.minimumPurchase) {
    const error = new Error(`Minimum pembelian untuk promo ini ${voucher.minimumPurchase}.`);
    error.status = 400;
    throw error;
  }
  const eligibilityMessage = getEligibilityMessage(voucher, product);
  if (eligibilityMessage) {
    const error = new Error(eligibilityMessage);
    error.status = 400;
    throw error;
  }
  const identities = getUsageIdentities(whatsapp, userId);
  if (voucher.oneUsePerUser) {
    if (!identities.phoneIdentity) {
      const error = new Error('Nomor WhatsApp diperlukan untuk menggunakan voucher ini.');
      error.status = 400;
      throw error;
    }
    const alreadyUsed = await hasMatchingIdentity(voucher._id, identities);
    if (alreadyUsed) {
      const error = new Error('Voucher hanya dapat digunakan 1x per user.');
      error.status = 409;
      throw error;
    }
  }
  return {
    voucherId: voucher._id,
    voucherCode: voucher.code,
    discountAmount: calculateDiscount(voucher, subtotal),
    oneUsePerUser: voucher.oneUsePerUser,
    identities,
  };
};
