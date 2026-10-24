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
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const conn = await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
      console.log("✅ Terhubung ke MongoDB:", conn.connection.host);
      return conn;
    } catch (err) {
      console.error(`❌ MongoDB connection attempt ${attempt}/${maxAttempts} failed:`, err.message);
      if (attempt === maxAttempts) {
        process.exit(1);
      }
      const delayMs = 1000 * (2 ** (attempt - 1));
      console.log(`Mencoba konek lagi dalam ${delayMs / 1000} detik…`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

module.exports = connectDB;
