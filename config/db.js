// ./config/db.js
const mongoose = require("mongoose");
const dns = require("node:dns");

const configuredDnsServers = (process.env.DNS_SERVERS || "")
  .split(",")
  .map((server) => server.trim())
  .filter(Boolean);

if (configuredDnsServers.length) {
  dns.setServers(configuredDnsServers);
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Terhubung ke MongoDB:", conn.connection.host);
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1); // Keluar dari aplikasi jika gagal konek
  }
};

module.exports = connectDB;
