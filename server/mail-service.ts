import nodemailer from 'nodemailer';

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
      console.error('SMTP configuration missing');
      return false;
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT),
      secure: parseInt(SMTP_PORT) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: SMTP_USER,
      to: params.to,
      subject: params.subject,
      text: params.text || '',
      html: params.html || '',
    });

    console.log('Email sent successfully to:', params.to);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}