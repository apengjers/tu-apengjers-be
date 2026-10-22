// controllers/transactionController.js
const Transaction = require('../models/Transaction');
const midtransClient = require('midtrans-client');

const midtrans = new midtransClient.Snap({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

exports.createTransaction = async (req, res) => {
  try {
    const { product, userEmail, userGameId, userNickname, paymentMethod } = req.body;

    const orderId = 'ORDER-' + Date.now();

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: 10000, // harusnya ambil dari produk
      },
      customer_details: {
        email: userEmail,
      },
    };

    const snap = await midtrans.createTransaction(parameter);

    const transaction = new Transaction({
      product,
      userEmail,
      userGameId,
      userNickname,
      paymentMethod,
      snapToken: snap.token,
      midtransOrderId: orderId,
    });

    await transaction.save();
    res.json(transaction);
  } catch (err) {
    console.error('Gagal buat transaksi:', err);
    res.status(500).json({ message: err.message });
  }
};
