# Backend ApengJers

REST API berbasis Express untuk autentikasi, katalog produk, dan pembayaran. Backend memakai MongoDB melalui Mongoose dan Midtrans dalam mode sandbox.

## Kebutuhan

- Node.js dan npm
- MongoDB lokal atau MongoDB Atlas
- Kredensial Midtrans Sandbox jika ingin memakai endpoint pembayaran

## Instalasi dan menjalankan

Dari folder backend:

```powershell
npm install
node server.js
```

Secara default server berjalan di `http://localhost:3001`. Frontend Vite yang diizinkan oleh konfigurasi CORS berjalan di `http://localhost:5173`.

## Konfigurasi environment

Buat file `.env` di folder ini. Jangan commit file tersebut atau membagikan nilainya.

```env
PORT=3001
NODE_ENV=development
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
JWT_SECRET=<secret-random-yang-panjang>
MIDTRANS_SERVER_KEY=<server-key-sandbox>
MIDTRANS_CLIENT_KEY=<client-key-sandbox>
```

Jika resolver DNS bawaan menolak query SRV MongoDB Atlas, tambahkan DNS publik yang bisa dijangkau Node:

```env
DNS_SERVERS=1.1.1.1,8.8.8.8
```

`DNS_SERVERS` bersifat opsional. Backend membaca daftar tersebut saat konfigurasi database dimuat. Setelah mengubah `.env`, restart server.

## Endpoint API

| Method | Path | Akses | Keterangan |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Publik | Membuat akun dengan role default `user`; password disimpan dalam bentuk hash. |
| `POST` | `/auth/login` | Publik | Login dan memperoleh JWT. |
| `GET` | `/auth/me` | JWT | Mengambil profil akun aktif. |
| `GET` | `/api/products` | Publik | Mengambil katalog. Mendukung filter `?jenis=gift` atau `?jenis=topup`. |
| `GET` | `/api/products/:id` | Publik | Mengambil satu produk. |
| `POST` | `/api/products` | JWT admin | Membuat produk. |
| `PUT` | `/api/products/:id` | JWT admin | Memperbarui produk. |
| `DELETE` | `/api/products/:id` | JWT admin | Menghapus produk. |
| `POST` | `/api/payment` | Publik | Membuat pembayaran Midtrans dari daftar item. |
| `GET` | `/api/checkpayment/:transactionId` | Publik | Meminta status transaksi dari Midtrans. |
| `POST` | `/api/transactions` | Publik | Membuat transaksi Snap dan menyimpannya ke MongoDB. |

Untuk endpoint yang memerlukan JWT, kirim header:

```http
Authorization: Bearer <token>
```

Contoh body pembuatan produk:

```json
{
  "nama": "Gift item Grow a Garden",
  "jenis": "gift",
  "harga": 25000,
  "kategori": "Grow a Garden",
  "stok": 3,
  "gambar": "https://example.com/item.jpg",
  "deskripsi": "Item gift yang tersedia di katalog."
}
```

Nilai `jenis` yang didukung: `gift` dan `topup`.

## Menjadikan akun sebagai admin

Registrasi selalu membuat akun dengan role `user`. Setelah akun penjual dibuat, ubah rolenya melalui MongoDB Compass atau mongosh pada database yang sama dengan `MONGODB_URI`:

```js
db.users.updateOne(
  { email: "email-penjual@example.com" },
  { $set: { role: "admin" } }
)
```

Login ulang, lalu buka `/adminproduct` di frontend. Operasi tambah, edit, dan hapus produk diperiksa kembali oleh backend berdasarkan role di database.

## Status implementasi dan batasan

- Pembayaran Midtrans dikonfigurasi ke sandbox (`isProduction: false`).
- Endpoint `/api/payment` menghitung total dari harga dan jumlah yang dikirim klien; validasi harga terhadap katalog server belum diterapkan.
- Endpoint `/api/transactions` masih memakai nominal tetap `10000` dan belum menyimpan detail joki/gift secara lengkap.
- Endpoint pencarian status order internal dan webhook pembayaran belum tersedia. Endpoint cek pembayaran saat ini meminta status langsung ke Midtrans.
- Email konfirmasi memakai akun Ethereal sementara untuk preview, bukan pengiriman email produksi.
- Belum ada script test backend yang berisi pengujian otomatis.

## Struktur utama

```text
backend/
├── auth/           # Strategi JWT Passport
├── config/         # MongoDB dan Midtrans
├── controllers/    # Handler API
├── models/         # Skema Mongoose
├── routes/         # Route Express
├── services/       # Email dan layanan pendukung
├── server.js       # Entry point
└── .env            # Konfigurasi lokal, jangan di-commit
```
