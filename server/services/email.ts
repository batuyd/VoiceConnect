import nodemailer from 'nodemailer';
import { emailTemplates } from './emailTemplates';

if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.SMTP_FROM_EMAIL) {
  console.error('Missing required SMTP environment variables');
}

// Create a transporter using SMTP settings
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false // Development only
  }
});

interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail({ to, subject, text, html }: SendEmailOptions): Promise<boolean> {
  try {
    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM_EMAIL,
      to,
      subject,
      text,
      html,
    });
    console.log('Email sent successfully:', result);
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

// Export email templates
export { emailTemplates };