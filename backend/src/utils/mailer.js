'use strict';
const nodemailer = require('nodemailer');

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    // Development fallback: no SMTP configured, so print the email in the terminal.
    console.log(`\n--- EMAIL (not sent, SMTP not configured) ---\nTo: ${to}\nSubject: ${subject}\n${text}\n---------------------------------------------\n`);
    return;
  }
  await transporter.sendMail({ from: process.env.MAIL_FROM || 'CryptoKit <no-reply@localhost>', to, subject, text, html });
}

const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

function sendVerificationEmail(user, rawToken) {
  const link = `${appUrl()}/api/auth/verify-email?token=${rawToken}`;
  return sendMail({
    to: user.email,
    subject: 'Verify your CryptoKit email',
    text: `Hi ${user.name},\n\nVerify your email (link valid for 24 hours):\n${link}\n\nIf you did not sign up, ignore this email.`,
    html: `<p>Hi ${esc(user.name)},</p><p><a href="${link}">Verify your email</a> (valid for 24 hours).</p><p>If you did not sign up, ignore this email.</p>`,
  });
}

function sendResetEmail(user, rawToken) {
  const link = `${appUrl()}/reset-password?token=${rawToken}`;
  return sendMail({
    to: user.email,
    subject: 'Reset your CryptoKit password',
    text: `Hi ${user.name},\n\nReset your password (link valid for 1 hour, one use):\n${link}\n\nIf you did not ask for this, ignore this email.`,
    html: `<p>Hi ${esc(user.name)},</p><p><a href="${link}">Reset your password</a> (valid for 1 hour, one use).</p><p>If you did not ask for this, ignore this email.</p>`,
  });
}

module.exports = { sendVerificationEmail, sendResetEmail };
