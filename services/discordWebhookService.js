const Setting = require('../models/Setting');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

exports.sendDiscordOrderNotification = async (order, eventType = 'ORDER_CREATED') => {
  try {
    const setting = await Setting.findOne({ key: 'notification_settings' }).lean();
    const config = setting?.value || {};
    const webhookUrl = String(config.webhookUrl || '').trim();

    if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) return;
    if (eventType === 'ORDER_CREATED' && config.discordNewOrder === false) return;
    if (eventType === 'ORDER_UPDATED' && config.discordOrderIssue === false) return;
    if (eventType === 'ORDER_PAID' && config.discordNewOrder === false) return;

    const buyerName = order.jenis === 'joki'
      ? (order.displayName || order.robloxUsername)
      : order.recipientUsername;

    const itemInfo = order.jenis === 'joki'
      ? `${order.robloxUsername} (${order.displayName})`
      : order.recipientUsername;

    let content = '';

    if (eventType === 'ORDER_CREATED') {
      content = [
        `@everyone Halo **APENGJERS** berikut data pesanan terbaru untuk toko kamu:`,
        `• Pesanan baru masuk [**${order.orderCode}**](<${FRONTEND_URL}/cek-transaksi>) ${order.productName} ${order.gameName || ''}`.trim(),
      ].join('\n');
    } else if (eventType === 'ORDER_PAID') {
      content = [
        `@everyone Halo **APENGJERS**, pembayaran pesanan sudah diterima ✅`,
        `• Nomor Pesanan: [${order.orderCode}](<${FRONTEND_URL}/cek-transaksi>)`,
        `• Nama Produk: ${order.productName}${order.gameName ? ` - ${order.gameName}` : ''}`,
        `• Total: Rp ${Number(order.totalPrice).toLocaleString('id-ID')}`,
        `• Metode: ${order.paymentType || '-'}`,
        `• Nama Pembeli: ${buyerName || order.whatsapp}`,
      ].join('\n');
    } else {
      content = [
        `@everyone Halo **APENGJERS, terdapat update/kendala pesanan (${order.status.toUpperCase()})**. Rincian pesanan sebagai berikut:`,
        `• Nomor Pesanan: [${order.orderCode}](<${FRONTEND_URL}/cek-transaksi>)`,
        `• Nama Produk: ${order.productName}${order.gameName ? ` - ${order.gameName}` : ''}`,
        `• Nama Item: ${order.jenis === 'joki' ? 'Joki' : 'Gift'}`,
        `• Nama Item Info: ${itemInfo || '-'}`,
        `• Nama Game: ${order.gameName || '-'}`,
        `• Nama Pembeli: ${buyerName || order.whatsapp}`,
      ].join('\n');
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) console.error('Discord webhook ditolak:', response.status, await response.text());
  } catch (error) {
    console.error('Gagal mengirim Discord webhook order:', error.message);
  }
};

exports.sendDiscordStockNotification = async (product) => {
  try {
    const setting = await Setting.findOne({ key: 'notification_settings' }).lean();
    const config = setting?.value || {};
    const webhookUrl = String(config.webhookUrl || '').trim();

    if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) return;
    if (config.discordEmptyStock === false) return;

    const content = [
      `@everyone Halo **APENGJERS**, ada produk yang kehabisan stok!`,
      `• Nama Produk: **${product.nama}**`,
      `• Stok Tersisa: **0**`,
      `• URL Katalog: ${FRONTEND_URL}/adminproduct`,
    ].join('\n');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) console.error('Discord webhook ditolak:', response.status, await response.text());
  } catch (error) {
    console.error('Gagal mengirim Discord webhook stok kosong:', error.message);
  }
};