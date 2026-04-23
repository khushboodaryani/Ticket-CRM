import 'dotenv/config';
import nodemailer from 'nodemailer';

const parseBoolean = (value, fallback) => {
    if (value === undefined || value === null || value === '') return fallback;
    return String(value).toLowerCase() === 'true';
};

export const smtpConfig = {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: parseBoolean(process.env.SMTP_SECURE, false),
    auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_USER,
        pass: process.env.SMTP_PASS || process.env.EMAIL_PASSWORD
    }
};

export const imapConfig = {
    host: process.env.IMAP_HOST || 'localhost',
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    tls: parseBoolean(process.env.IMAP_TLS, true),
    user: process.env.IMAP_USER || process.env.EMAIL_USER,
    pass: process.env.IMAP_PASS || process.env.EMAIL_PASSWORD
};

export const transporter = nodemailer.createTransport(smtpConfig);
