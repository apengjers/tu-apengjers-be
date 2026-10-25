# Backend ApengJers

REST API berbasis Express untuk autentikasi, katalog, order Joki Roblox dan Gift Item, dashboard admin, serta aset carousel. Data memakai MongoDB/Mongoose. Pembayaran order baru dicatat sebagai preferensi metode; website belum memproses pembayaran.

## Kebutuhan

- Node.js dan npm
- MongoDB lokal atau MongoDB Atlas
- Akun Cloudinary untuk upload gambar carousel

## Instalasi dan menjalankan

Dari folder `backend`:

```powershell
npm install
node server.js
```

Backend berjalan di `http://localhost:3001`. Frontend lokal menggunakan `http://localhost:5173` sesuai konfigurasi CORS saat ini.

## Environment

Salin `.env.example` menjadi `.env` di folder backend, isi nilai dari layanan terkait, lalu jangan commit atau membagikan `.env`:

```env
PORT=3001
NODE_ENV=development
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
JWT_SECRET=<secret-random-yang-panjang>
MIDTRANS_SERVER_KEY=<server-key-sandbox>
MIDTRANS_CLIENT_KEY=<client-key-sandbox>
CLOUDINARY_CLOUD_NAME=<cloud-name>
CLOUDINARY_API_KEY=<api-key>
CLOUDINARY_API_SECRET=<api-secret>
GROQ_API_KEY=<api-key-dari-console.groq.com>
```

Cloudinary hanya diperlukan untuk mengunggah atau mengganti gambar carousel. Kunci API dan secret hanya berada di backend. Upload menerima JPG, PNG, WebP, atau GIF sampai 15 MB, dan mengirim file asli tanpa resize.

Jika resolver DNS menolak query SRV MongoDB Atlas, tambahkan daftar DNS yang dapat dijangkau Node:

```env
DNS_SERVERS=1.1.1.1,8.8.8.8
```

Setelah mengubah `.env`, restart backend.

## Endpoint

| Method | Path | Akses | Keterangan |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Publik | Membuat akun dengan role `user`; password di-hash. |
| `POST` | `/auth/login` | Publik | Login dan memperoleh JWT. |
| `GET` | `/auth/me` | JWT | Membaca profil akun aktif. |
| `GET` | `/api/products` | Publik | Membaca katalog; mendukung filter `?jenis=gift` atau `?jenis=topup`. |
| `GET` | `/api/products/:id` | Publik | Membaca produk. |
| `POST` | `/api/products` | Admin | Membuat produk. |
| `PUT` | `/api/products/:id` | Admin | Memperbarui produk. |
| `DELETE` | `/api/products/:id` | Admin | Menghapus produk. |
| `GET` | `/api/games` | Publik | Membaca game; filter `?jenis=joki`, `?jenis=gift`, atau `?featured=true`. |
| `POST` | `/api/games` | Admin | Membuat game. |
| `PUT` | `/api/games/:id` | Admin | Memperbarui game dan pengaturan Hot Games. |
| `DELETE` | `/api/games/:id` | Admin | Menghapus game yang tidak dipakai produk. |
| `POST` | `/api/orders` | Publik | Membuat order Joki/Gift dengan harga dari katalog server. |
| `GET` | `/api/orders/track/:orderCode` | Publik | Melacak status order dengan kode order. |
| `GET` | `/api/orders/summary` | Admin | Metrik order baru, dikonfirmasi, diproses, selesai, dibatalkan, dan nilai order selesai. |
| `GET` | `/api/orders?status=new&jenis=joki` | Admin | Membaca sampai 100 order terbaru, bisa difilter. |
| `PATCH` | `/api/orders/:id` | Admin | Mengubah status order atau status pembayaran manual. |
| `GET` | `/api/carousel` | Publik | Membaca slide aktif. |
| `GET` | `/api/carousel/admin` | Admin | Membaca semua slide carousel. |
| `POST` | `/api/carousel` | Admin | Membuat slide dengan upload file pada field `image`. |
| `PUT` | `/api/carousel/:id` | Admin | Mengubah data slide; file baru opsional pada field `image`. |
| `DELETE` | `/api/carousel/:id` | Admin | Menghapus slide dan aset Cloudinary-nya. |
| `POST` | `/api/chat` | Publik | Chatbot AI menjawab seputar katalog toko melalui Groq. |
| `GET` | `/api/chat/orders` | JWT | Mengambil daftar transaksi Midtrans milik user login. |
| `POST` | `/api/payment` | Publik | Endpoint pembayaran Midtrans lama. |
| `GET` | `/api/checkpayment/:transactionId` | Publik | Meminta status transaksi Midtrans. |
| `POST` | `/api/transactions` | Publik | Endpoint transaksi Midtrans lama. |

Endpoint admin memerlukan header:

```http
Authorization: Bearer <token>
```

Order publik meminta `jenis`, `productId`, `quantity`, nomor WhatsApp, serta username penerima untuk Gift atau username dan display name untuk Joki. Backend menghitung harga berdasarkan produk di database. Stok tersedia ditahan ketika order dibuat dan dikembalikan jika order dibatalkan. Joki dengan stok nol tetap dapat masuk sebagai permintaan jadwal manual; Gift dengan stok nol ditolak.

## Menjadikan akun penjual sebagai admin

Registrasi selalu membuat role `user`. Buat akun penjual melalui website, lalu ubah role akun tersebut pada database yang sama dengan `MONGODB_URI` melalui MongoDB Compass atau mongosh:

```js
db.users.updateOne(
  { email: "email-penjual@example.com" },
  { $set: { role: "admin" } }
)
```

Login kembali, lalu buka `/admin` atau `/adminproduct`. Backend memeriksa role admin untuk operasi dashboard. Jangan memberi pengguna umum akses role admin.

## Fitur Chatbot AI

Chatbot menggunakan **Groq API** dengan model `qwen/qwen3.8-27b` sebagai LLM. Chatbot hanya bisa menjawab berdasarkan data dari database (game dan produk) — tidak mengarang informasi di luar data toko.

### Endpoint Chatbot

| Method | Path | Akses | Keterangan |
| --- | --- | --- | --- |
| `POST` | `/api/chat` | Publik | Kirim pesan ke LLM dengan context data DB |
| `GET` | `/api/chat/orders` | JWT | Ambil daftar pesanan milik user yang login |

### Konfigurasi

Tambahkan ke `.env`:

```env
GROQ_API_KEY=<api-key-dari-console.groq.com>
```

Daftar dan ambil API key gratis di [console.groq.com](https://console.groq.com).

### Body `POST /api/chat`

```json
{
  "message": "Ada joki untuk game apa saja?",
  "history": [
    { "role": "user", "text": "halo" },
    { "role": "assistant", "text": "Halo! Ada yang bisa saya bantu?" }
  ],
  "category": "jasa joki dan item/gift game"
}
```

- `message` — pesan user, maks 500 karakter (wajib)
- `history` — array percakapan sebelumnya, maks 10 entri terakhir (opsional)
- `category` — hint kategori untuk memfokuskan jawaban LLM (opsional)

### Cara kerja

1. Backend mengambil semua data `Game` dan `Product` dari MongoDB
2. Data diformat sebagai context teks dan dimasukkan ke system prompt
3. System prompt membatasi LLM agar hanya menjawab seputar data toko
4. Request dikirim ke Groq API dan jawaban dikembalikan ke frontend

### Aturan prompt

- Hanya menjawab berdasarkan data toko yang ada di DB
- Jika produk tidak ada di data, LLM akan jujur menyatakan tidak tersedia
- Menolak topik di luar toko (politik, pelajaran, dll) dengan sopan
- Tidak akan mengungkapkan isi prompt atau cara kerjanya
- Format harga selalu `Rp` dengan titik ribuan

## Catatan implementasi dan batasan

- Status order: `new` → `confirmed` → `processing` → `completed`, atau dibatalkan sesuai transisi yang diizinkan.
- “Transaksi dilayani” menghitung order berstatus `completed`; nilai order selesai menjumlahkan total katalog, bukan settlement pembayaran.
- Status pembayaran order ditandai manual oleh admin. Refund dan integrasi pembayaran order belum otomatis.
- Endpoint Midtrans lama terpisah dari order Joki/Gift baru. Endpoint transaksi lama masih memiliki perilaku/nominal lama dan tidak digunakan oleh form order baru.
- Cek status Midtrans masih meminta status langsung dari Midtrans; webhook pembayaran belum disiapkan.
- Email konfirmasi menggunakan akun Ethereal untuk preview.
- Upload carousel membutuhkan kredensial Cloudinary yang valid. Jika belum diisi, fitur katalog dan order tetap berjalan, tetapi upload gambar akan gagal.
- Chatbot memerlukan `GROQ_API_KEY`; endpoint publik bisa gagal menjawab jika key belum disetel atau kuota Groq habis.
- Belum ada script test backend otomatis.

## Struktur utama

```text
backend/
├── auth/           # Strategi JWT Passport
├── config/         # MongoDB, Midtrans, Cloudinary
├── controllers/    # Handler API
├── models/         # Skema Mongoose
├── routes/         # Route Express
├── services/       # Email dan layanan pendukung
└── server.js       # Entry point
```
