// src/services/emailService.js
import nodemailer from 'nodemailer';
import { logger } from '../logger.js';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', // Assuming Gmail based on the app context, or adjustable via env
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

/**
 * Send notification to customer about new ticket
 */
export const sendTicketNotification = async (ticket, customerEmail) => {
    if (!customerEmail) return;

    const mailOptions = {
        from: `"Ticket CRM" <${process.env.EMAIL_USER}>`,
        to: customerEmail,
        subject: `[${ticket.ticket_number}] Ticket Created: ${ticket.category}`,
        html: `
      <div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #4f8ef7;">Ticket Created Successfully</h2>
        <p>Hello,</p>
        <p>Your ticket has been logged in our system. Our team will look into it shortly.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Ticket Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.ticket_number}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Priority:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.priority}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Description:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.description}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>ETR (Estimated Resolution):</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.etr}</td></tr>
        </table>
        <p>Regards,<br/>Ticket CRM Support Team</p>
      </div>
    `
    };

    try {
        await transporter.sendMail(mailOptions);
        logger.info(`📧 Notification email sent to ${customerEmail} for ticket ${ticket.ticket_number}`);
    } catch (error) {
        logger.error(`❌ Failed to send notification email: ${error.message}`);
    }
};
