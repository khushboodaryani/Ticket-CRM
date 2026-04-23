import dotenv from 'dotenv';
dotenv.config();

console.log('--- MAIL ENV DEBUG ---');
console.log('SMTP_USER:', process.env.SMTP_USER);
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('IMAP_USER:', process.env.IMAP_USER);
console.log('SMTP_PASS is set:', !!(process.env.SMTP_PASS || process.env.EMAIL_PASSWORD));
console.log('IMAP_PASS is set:', !!(process.env.IMAP_PASS || process.env.EMAIL_PASSWORD));
console.log('-----------------------');
