require('dotenv').config();
const express = require('express');
const cors = require('cors');
const passport = require('passport');
require('./auth/passport')(passport); // init JWT strategy

const connectDB = require('./config/db');
connectDB(); // koneksi MongoDB

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(passport.initialize());

// Routes
const authRoutes = require('./routes/authRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const productRoutes = require('./routes/productRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const gameRoutes = require('./routes/gameRoutes');

app.use('/auth', authRoutes);
app.use('/api', paymentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/games', gameRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
