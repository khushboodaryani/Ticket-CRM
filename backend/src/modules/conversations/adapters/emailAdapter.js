// src/modules/conversations/adapters/emailAdapter.js
// Sends agent replies back to customers via email

import nodemailer from 'nodemailer';
import { logger } from '../../../logger.js';
import connectDB from '../../../db/index.js';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

/**
 * Send agent reply to customer via email
 * @param {string} customerEmail - Customer's email address
 * @param {object} data - { message: string, ticketNumber: string, ticketId: number }
 */
export const send = async (customerEmail, data) => {
    if (!customerEmail || !data.message) {
        logger.warn('[EmailAdapter] Missing customerEmail or message');
        return;
    }

    const pool = connectDB();
    
    try {
        // Fetch ticket details
        const [tickets] = await pool.query(
            `SELECT ticket_number, category, priority FROM tickets WHERE id = ? LIMIT 1`,
            [data.ticketId]
        );

        if (!tickets.length) {
            logger.error(`[EmailAdapter] Ticket ${data.ticketId} not found`);
            return;
        }

        const ticket = tickets[0];
        const formattedMessage = data.message.replace(/\n/g, '<br/>');

        // Email threading headers - reference the original ticket message
        const originalMessageId = `<${ticket.ticket_number}@ticketcrm.local>`;

        const mailOptions = {
            from: `"Ticket CRM Support" <${process.env.EMAIL_USER}>`,
            to: customerEmail,
            subject: `Re: [${ticket.ticket_number}] ${ticket.category}`,
            headers: {
                'In-Reply-To': originalMessageId,
                'References': originalMessageId,
            },
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333;">
                    <h3 style="color: #4f8ef7; margin-bottom: 10px;">Update on Your Ticket</h3>
                    <p style="background: #f8f9fa; padding: 12px; border-left: 3px solid #4f8ef7; margin: 16px 0;">
                        <strong>Ticket:</strong> ${ticket.ticket_number}<br/>
                        <strong>Subject:</strong> ${ticket.category}
                    </p>
                    <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0; white-space: pre-wrap; line-height: 1.6;">
                        ${formattedMessage}
                    </div>
                    <p style="font-size: 13px; color: #666; margin-top: 24px;">
                        To reply, simply respond to this email. Your response will be added to the ticket conversation.
                    </p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
                    <p style="font-size: 12px; color: #999;">
                        Regards,<br/>
                        Team Multycomm
                    </p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        logger.info(`📧 [EmailAdapter] Reply sent to ${customerEmail} for ticket ${ticket.ticket_number}`);

    } catch (error) {
        logger.error(`❌ [EmailAdapter] Failed to send email: ${error.message}`);
        throw error;
    }
};
