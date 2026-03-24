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
 * Generate HTML for previous conversation trail
 */
export const getConversationTrailHtml = async (pool, ticketId, excludeMessageId = 0) => {
    try {
        const [conversations] = await pool.query(
            "SELECT id FROM conversations WHERE ticket_id = ? LIMIT 1",
            [ticketId]
        );
        
        if (!conversations.length) return "";

        const conversationId = conversations[0].id;
        const queryArgs = [conversationId];
        let queryStr = `
            SELECT cm.*, u.name as sender_name 
            FROM conversation_messages cm 
            LEFT JOIN users u ON cm.sender_id = u.id 
            WHERE cm.conversation_id = ? AND cm.is_internal_note = 0
        `;
        
        if (excludeMessageId) {
            queryStr += " AND cm.id != ?";
            queryArgs.push(excludeMessageId);
        }
        
        queryStr += " ORDER BY cm.created_at DESC LIMIT 5";

        const [msgRows] = await pool.query(queryStr, queryArgs);

        if (msgRows.length === 0) return "";

        return `
            <div style="margin-top: 30px; border-top: 2px solid #e2e8f0; padding-top: 15px;">
                <p style="font-size: 13px; color: #666; font-weight: bold; margin-bottom: 12px;">--- Previous Conversation ---</p>
                ${msgRows.map(msg => {
                    const sender = msg.sender_type === 'agent' ? (msg.sender_name || 'Support Agent') : 'You';
                    const date = new Date(msg.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
                    const body = (msg.message_body || '').replace(/\n/g, '<br/>');
                    return `
                        <div style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed #f0f0f0;">
                            <p style="font-size: 11px; color: #888; margin: 0;"><strong>${sender}</strong> - ${date}</p>
                            <div style="font-size: 12px; margin: 4px 0 0 0; color: #444; line-height: 1.5;">${body}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } catch (e) {
        logger.error(`[EmailAdapter] Trail Error: ${e.message}`);
        return "";
    }
};

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
        let senderName = "Support Team";
        let signature = "";

        if (data.senderId) {
            const [users] = await pool.query(
                "SELECT name, signature FROM users WHERE id = ?",
                [data.senderId]
            );
            if (users.length) {
                senderName = users[0].name;
                signature = users[0].signature || "";
            }
        }

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

        // Fetch previous messages for the trail
        const trailHtml = await getConversationTrailHtml(pool, data.ticketId, data.messageId);

        // Email threading headers - reference the original ticket message
        const originalMessageId = `<${ticket.ticket_number}@ticketcrm.local>`;

        const mailOptions = {
            from: `"Support Team" <${process.env.EMAIL_USER}>`,
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

                    ${signature ? `<div style="margin: 15px 0; padding: 10px; background: #fafafa; border-radius: 4px; border-left: 3px solid #ddd; color: #555; font-size: 13px; white-space: pre-line;">${signature}</div>` : ''}

                    ${trailHtml}

                    <p style="font-size: 13px; color: #666; margin-top: 24px;">
                        To reply, simply respond to this email. Your response will be added to the ticket conversation.
                    </p>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
                    <p style="font-size: 12px; color: #999;">
                        Regards,<br/>
                        <strong>${senderName}</strong><br/>
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
