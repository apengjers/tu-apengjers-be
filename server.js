require('dotenv').config();
const express = require('express');
const cors = require('cors');
const passport = require('passport');
require('./auth/passport')(passport);

const connectDB = require('./config/db');
connectDB();

const app = express();
const PORT = process.env.PORT || 3001;


app.use(cors({
  origin: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, ''),
  credentials: true,
}));
app.use(express.json());
app.use(passport.initialize());
app.use('/api/midtrans', require('./routes/midtransRoutes'));

const authRoutes = require('./routes/authRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const productRoutes = require('./routes/productRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const gameRoutes = require('./routes/gameRoutes');
const chatRoutes = require('./routes/chatRoutes');
const orderRoutes = require('./routes/orderRoutes');
const carouselRoutes = require('./routes/carouselRoutes');

app.use('/auth', authRoutes);
app.use('/api', paymentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/carousel', carouselRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
