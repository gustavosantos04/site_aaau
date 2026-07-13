import nodemailer from "nodemailer";

export function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!host || !port || !user || !pass || !from) {
    return null;
  }

  return {
    host,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: { user, pass },
    from,
    internalRecipient: process.env.ORDER_NOTIFICATION_EMAIL?.trim(),
  };
}

export function createSmtpTransport(config: NonNullable<ReturnType<typeof getSmtpConfig>>) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });
}
