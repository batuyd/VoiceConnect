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

export default emailTemplates;
