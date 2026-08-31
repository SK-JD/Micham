import nodemailer from "nodemailer";
import { smtpConfigured } from "./env";

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{ filename: string; content: string; contentType: string }>;
};

export async function sendMail(message: MailMessage) {
  if (!smtpConfigured()) {
    return { delivered: false, reason: "SMTP is not configured." };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    ...message,
  });
  return { delivered: true };
}
