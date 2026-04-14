// scratch/send_test_ticket.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

async function sendTest() {
    const testId = `TEST-${Date.now()}`;
    const mailOptions = {
        from: `"Verification Bot" <${process.env.EMAIL_USER}>`,
        to: 'khushboodaryani1@gmail.com',
        subject: `[Live Test] Concurrency Verification - ${testId}`,
        text: `This is a test email to verify that only one ticket is generated for single emails. Reference: ${testId}`
    };

    console.log(`Sending test email to khushboodaryani1@gmail.com...`);
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email Sent! Message ID: ${info.messageId}`);
        console.log(`Follow-up: Wait 2 minutes for poller to pick it up, then check tickets table.`);
    } catch (error) {
        console.error(`❌ Failed to send email:`, error.message);
    }
    process.exit(0);
}

sendTest();
