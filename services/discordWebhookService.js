const Setting = require('../models/Setting');

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

exports.sendDiscordOrderNotification = async (order, eventType = 'ORDER_PAID') => {
  if (eventType !== 'ORDER_PAID') return;

  try {
    const setting = await Setting.findOne({ key: 'notification_settings' }).lean();
    const config = setting?.value || {};
    const webhookUrl = String(config.webhookUrl || '').trim();
    if (!webhookUrl.startsWith('https://discord.com/api/webhooks/')) return;
    if (config.discordPaymentReceived === false) return;

    const orderUrl = `${FRONTEND_URL}/cek-transaksi?orderCode=${encodeURIComponent(order.orderCode)}`;
    const productName = `${order.productName}${order.gameName ? ` ${order.gameName}` : ''}`;
    const buyerName = order.displayName || order.robloxUsername || order.recipientUsername || order.whatsapp || '-';
    const content = `@everyone Halo APENGJERS, pembayaran pesanan sudah diterima! Nomor Pesanan: [${order.orderCode}](<${orderUrl}>) | Produk: ${productName} | Total: Rp ${Number(order.totalPrice).toLocaleString('id-ID')} | Metode: ${order.paymentType || order.paymentChannel || '-'} | Pembeli: ${buyerName}`;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: ['everyone'] } }),
    });
    if (!response.ok) console.error('Discord webhook ditolak:', response.status, await response.text());
  } catch (error) {
    console.error('Gagal mengirim Discord webhook pembayaran:', error.message);
  }
};
