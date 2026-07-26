// utils/email.js - nodemailer v6 compatible
const nodemailer = require('nodemailer');

let transporter = null;
let verifiedOnce = false;

function getTransporter() {
  if (transporter) return transporter;
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      requireTLS: process.env.EMAIL_REQUIRE_TLS === 'true',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
  } else {
    // Dev: log only, no real sending
    transporter = { sendMail: async (opts) => { console.log(`📧 [DEV EMAIL] To:${opts.to} | ${opts.subject}`); return { messageId:'dev' }; } };
  }
  return transporter;
}

async function verifyEmailTransport() {
  const hasSmtpConfig = process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS;
  if (!hasSmtpConfig) {
    return { ok: true, mode: 'dev-log', message: 'EMAIL_HOST/EMAIL_USER/EMAIL_PASS not set. Using dev email logger.' };
  }

  try {
    const t = getTransporter();
    await t.verify();
    verifiedOnce = true;
    return { ok: true, mode: 'smtp', message: 'SMTP server verified.' };
  } catch (err) {
    return { ok: false, mode: 'smtp', message: err.message };
  }
}

async function sendEmail({ to, subject, html, text }) {
  try {
    if (!verifiedOnce) {
      await verifyEmailTransport();
    }
    const t = getTransporter();
    const info = await t.sendMail({
      from: `"BidWars" <${process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@bidwars.com'}>`,
      to, subject, html, text
    });
    return info;
  } catch (err) {
    console.error('Email send failed:', err.message);
    // Never crash the app due to email failure
  }
}

module.exports = { sendEmail, verifyEmailTransport };
