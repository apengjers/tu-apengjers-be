const nodemailer = require('nodemailer');

// Jika SMTP_HOST diisi di .env -> pakai SMTP asli.
// Jika kosong -> pakai akun test Ethereal (hanya untuk development, email tidak benar-benar terkirim).
let transporterPromise;

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      if (process.env.SMTP_HOST) {
        return nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: Number(process.env.SMTP_PORT) === 465,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
      }
      const testAccount = await nodemailer.createTestAccount();
      return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
    })();
  }
  return transporterPromise;
}

const FROM = process.env.MAIL_FROM || '"ApengJers" <no-reply@apengjers.com>';

async function sendMail(to, subject, html) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({ from: FROM, to, subject, html });
  if (!process.env.SMTP_HOST) {
    console.log('📧 Preview URL (Ethereal):', nodemailer.getTestMessageUrl(info));
  }
  return info;
}

// Dipertahankan agar controller lain yang sudah memakainya tetap jalan
async function sendConfirmationEmail(to, subject, htmlContent) {
  return sendMail(to, subject, htmlContent);
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function sendPasswordResetEmail(to, displayName, resetUrl) {
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <h2 style="margin:0 0 12px;font-size:20px">Atur ulang kata sandi</h2>
    <p style="margin:0 0 16px;line-height:1.5">Halo ${escapeHtml(displayName)}, kami menerima permintaan untuk mengatur ulang kata sandi akun ApengJers kamu.</p>
    <p style="margin:0 0 24px">
      <a href="${resetUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">Buat kata sandi baru</a>
    </p>
    <p style="margin:0 0 8px;line-height:1.5;font-size:14px">Tautan ini berlaku 30 menit dan hanya bisa dipakai sekali.</p>
    <p style="margin:0;line-height:1.5;font-size:14px;color:#64748b">Kalau kamu tidak meminta ini, abaikan email ini. Kata sandi kamu tidak berubah.</p>
  </div>`;
  return sendMail(to, 'Atur ulang kata sandi ApengJers', html);
}

module.exports = { sendConfirmationEmail, sendPasswordResetEmail };