import nodemailer from 'nodemailer';

// Create a transporter using Outlook SMTP settings
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail({ to, subject, text, html }: SendEmailOptions): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM_EMAIL,
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

// Verify SMTP connection on startup
export async function verifyEmailConnection(): Promise<boolean> {
  try {
    await transporter.verify();
    console.log('SMTP connection verified successfully');
    return true;
  } catch (error) {
    console.error('SMTP connection verification failed:', error);
    return false;
  }
}

// Email templates
export const emailTemplates = {
  welcomeEmail: (username: string) => ({
    subject: 'Hoş Geldiniz!',
    html: `
      <h1>Merhaba ${username}!</h1>
      <p>Platformumuza hoş geldiniz. Hesabınız başarıyla oluşturuldu.</p>
      <p>İyi eğlenceler!</p>
    `,
  }),

  passwordReset: (resetToken: string) => ({
    subject: 'Şifre Sıfırlama İsteği',
    html: `
      <h1>Şifre Sıfırlama</h1>
      <p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:</p>
      <a href="${process.env.APP_URL}/reset-password?token=${resetToken}">Şifremi Sıfırla</a>
      <p>Bu bağlantı 1 saat süreyle geçerlidir.</p>
    `,
  }),

  friendRequest: (fromUsername: string) => ({
    subject: 'Yeni Arkadaşlık İsteği',
    html: `
      <h1>Yeni Arkadaşlık İsteği</h1>
      <p>${fromUsername} size arkadaşlık isteği gönderdi.</p>
      <p>İsteği kabul etmek veya reddetmek için uygulamaya giriş yapın.</p>
    `,
  }),
};
