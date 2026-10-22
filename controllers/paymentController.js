const coreApi = require('../config/midtrans');
const { sendConfirmationEmail } = require('../services/mailService');

exports.createPayment = async (req, res) => {
  const { items, paymentMethod, email } = req.body;

  if (!items || items.length === 0 || !paymentMethod) {
    return res.status(400).json({ message: 'Item atau metode pembayaran tidak lengkap' });
  }

  const grossAmount = items.reduce((total, item) => total + item.harga * item.jumlah, 0);
  const orderId = 'ORDER-' + Math.floor(1000000 + Math.random() * 9000000);

  const parameter = {
    payment_type: paymentMethod,
    transaction_details: { order_id: orderId, gross_amount: grossAmount },
    item_details: items.map(item => ({
      id: item.id.toString(),
      price: item.harga,
      quantity: item.jumlah,
      name: item.nama,
    })),
    customer_details: { first_name: 'Pembeli', email: email || 'test@mail.com' },
  };

  if (paymentMethod === 'bank_transfer') parameter.bank_transfer = { bank: 'bca' };
  else if (paymentMethod === 'qris') parameter.qris = {};
  else if (paymentMethod === 'gopay') parameter.gopay = {};
  else if (paymentMethod === 'shopeepay') parameter.shopeePay = {};
  else if (paymentMethod === 'ovo') parameter.ovo = {};
  else if (paymentMethod === 'indomaret' || paymentMethod === 'alfamart') {
    parameter.cstore = { store: paymentMethod, message: 'Thank you' };
  } else return res.status(400).json({ message: 'Payment method tidak valid' });

  try {
    const transaction = await coreApi.charge(parameter);

    if (transaction.status_code === '201' && email) {
      const htmlContent = `
        <h3>Order Anda Telah Diterima</h3>
        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>Total:</strong> Rp ${grossAmount.toLocaleString('id-ID')}</p>
        <p><strong>Status:</strong> ${transaction.transaction_status}</p>
      `;
      await sendConfirmationEmail(email, 'Konfirmasi Pembayaran', htmlContent);
    }

    res.json(transaction);
  } catch (error) {
    console.error('Error transaksi:', error);
    res.status(500).json({ message: 'Gagal memproses pembayaran', error: error.message });
  }
};

exports.checkPaymentStatus = async (req, res) => {
  const { transactionId } = req.params;
  try {
    const result = await coreApi.transaction.status(transactionId);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal cek status transaksi', error: err.message });
  }
};
