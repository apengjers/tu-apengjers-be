const nodemailer = require('nodemailer');

async function sendConfirmationEmail(to, subject, htmlContent) {
  const testAccount = await nodemailer.createTestAccount();

  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  const info = await transporter.sendMail({
    from: '"Admin TopUp" <no-reply@example.com>',
    to,
    subject,
    html: htmlContent,
  });

  console.log('📧 Preview URL:', nodemailer.getTestMessageUrl(info));
}

module.exports = { sendConfirmationEmail };
