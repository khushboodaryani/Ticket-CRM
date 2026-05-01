// src/services/emailService.js
import { logger } from '../logger.js';
import { transporter } from './mailTransport.js';
import connectDB from '../db/index.js';

const EMAIL_CONFIG = {
    user: process.env.SMTP_USER || process.env.EMAIL_USER || null,
    pass: process.env.SMTP_PASS || process.env.EMAIL_PASSWORD || null,
    enabled: !!((process.env.SMTP_USER || process.env.EMAIL_USER) && (process.env.SMTP_PASS || process.env.EMAIL_PASSWORD))
};
const SENDER_EMAIL = EMAIL_CONFIG.user;

function normalizeMessageId(messageId = '') {
    return String(messageId || '').replace(/[<>]/g, '').trim();
}

function withOutboundTrustHeaders(mailOptions = {}) {
    return {
        ...mailOptions,
        headers: {
            ...(mailOptions.headers || {}),
            'X-Source': 'internal',
            'X-Ticket-CRM-Origin': 'outbound'
        }
    };
}

async function recordSystemSentMessage(messageId, ticketId = null) {
    const cleanMsgId = normalizeMessageId(messageId);
    if (!cleanMsgId) return;

    try {
        const pool = connectDB();
        await pool.query(
            `INSERT IGNORE INTO system_sent_messages (message_id, ticket_id) VALUES (?, ?)`,
            [cleanMsgId, ticketId || null]
        );
    } catch (err) {
        logger.warn(`[EmailService] Failed to record system sent message ${cleanMsgId}: ${err.message}`);
    }
}

/**
 * Send notification to customer about new ticket
 */
export const sendTicketNotification = async (ticket, customerEmail) => {
    if (!customerEmail) return;

    const mailOptions = {
        from: `"Ticket CRM" <${SENDER_EMAIL}>`,
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
        const info = await transporter.sendMail(withOutboundTrustHeaders(mailOptions));
        await recordSystemSentMessage(info?.messageId, ticket?.id || null);
        logger.info(`📧 Notification email sent to ${customerEmail} for ticket ${ticket.ticket_number}`);
    } catch (error) {
        logger.error(`❌ Failed to send notification email: ${error.message}`);
    }
};
