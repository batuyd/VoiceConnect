import { MailService } from '@sendgrid/mail';

const mailService = new MailService();

interface EmailParams {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
      throw new Error('SMTP ayarları eksik');
    }

    const emailConfig = {
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT),
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASSWORD
      },
      secure: parseInt(SMTP_PORT) === 465
    };

    mailService.setApiKey(SMTP_PASSWORD);

    await mailService.send({
      to: params.to,
      from: SMTP_USER,
      subject: params.subject,
      text: params.text || '',
      html: params.html || '',
    });

    return true;
  } catch (error) {
    console.error('Mail gönderme hatası:', error);
    return false;
  }
}