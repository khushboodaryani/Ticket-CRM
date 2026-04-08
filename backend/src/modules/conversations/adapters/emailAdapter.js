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
 * Build a full chronological conversation trail for inclusion in outgoing emails.
 * Merges conversation messages + key activity events (status changes, assignments)
 * sorted oldest → newest so the customer reads the thread naturally top-to-bottom.
 */
export const getConversationTrailHtml = async (pool, ticketId) => {
    try {
        // ── 1. Fetch all non-internal conversation messages ───────────────────
        const [conversations] = await pool.query(
            "SELECT id FROM conversations WHERE ticket_id = ?",
            [ticketId]
        );

        let messages = [];
        if (conversations.length) {
            const convIds = conversations.map(c => c.id);
            const [msgRows] = await pool.query(
                `SELECT cm.created_at, cm.message_body, cm.sender_type, cm.sender_name as guest_name,
                        u.name as agent_name
                 FROM conversation_messages cm
                 LEFT JOIN users u ON cm.sender_id = u.id
                 WHERE cm.conversation_id IN (?) AND cm.is_internal_note = 0
                 ORDER BY cm.created_at ASC`,
                [convIds]
            );
            messages = msgRows.map(m => ({
                ts: new Date(m.created_at),
                type: 'message',
                sender: m.sender_type === 'agent' 
                    ? (m.agent_name || 'Support Agent') 
                    : (m.guest_name || 'Customer'),
                senderType: m.sender_type,
                body: (m.message_body || '').replace(/\n/g, '<br/>')
            }));
        }

        // ── 2. Fetch key activity events ──────────────────────────────────────
        const [actRows] = await pool.query(
            `SELECT ta.created_at, ta.action, ta.note, u.name as actor_name
             FROM ticket_activities ta
             LEFT JOIN users u ON ta.performed_by = u.id
             WHERE ta.ticket_id = ?
               AND ta.action IN ('created','updated','status_changed','assigned','priority_changed','sla_breached')
             ORDER BY ta.created_at ASC`,
            [ticketId]
        );
        const events = actRows.map(a => ({
            ts: new Date(a.created_at),
            type: 'event',
            actor: a.actor_name || 'System',
            note: a.note || a.action
        }));

        // ── 3. Merge + sort everything chronologically ────────────────────────
        const timeline = [...messages, ...events].sort((a, b) => a.ts - b.ts);

        if (timeline.length === 0) return '';

        const rows = timeline.map(item => {
            const dateStr = item.ts.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

            if (item.type === 'event') {
                return `
                <tr>
                  <td style="padding:8px 12px; border-bottom:1px solid #f0f0f0;">
                    <span style="display:inline-block;background:#f1f5f9;color:#475569;
                                 font-size:11px;padding:3px 8px;border-radius:12px;">
                      🔔 ${item.note}
                    </span>
                    <span style="font-size:10px;color:#94a3b8;margin-left:8px;">${dateStr}</span>
                  </td>
                </tr>`;
            }

            // message row
            const isAgent = item.senderType === 'agent';
            const bgColor = isAgent ? '#f0f9ff' : '#ffffff';
            const borderColor = isAgent ? '#3b82f6' : '#e2e8f0';
            const labelColor = isAgent ? '#1d4ed8' : '#374151';
            return `
                <tr>
                  <td style="padding:10px 12px; border-bottom:1px solid #f0f0f0; background:${bgColor};">
                    <p style="margin:0 0 4px 0; font-size:11px; color:${labelColor}; font-weight:600;">
                      ${item.sender}
                      <span style="font-weight:400;color:#94a3b8;margin-left:6px;">${dateStr}</span>
                    </p>
                    <div style="font-size:13px;color:#374151;line-height:1.6;
                                border-left:3px solid ${borderColor};padding-left:10px;margin-top:4px;">
                      ${item.body}
                    </div>
                  </td>
                </tr>`;
        }).join('');

        return `
        <div style="margin-top:20px; border-top:1px solid #e2e8f0; padding-top:10px;">
          <table width="100%" cellpadding="0" cellspacing="0"
                 style="background:#fff; font-family:sans-serif;">
            ${rows}
          </table>
        </div>`;

    } catch (e) {
        logger.error(`[EmailAdapter] Trail Error: ${e.message}`);
        return '';
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
        let senderName = 'Support Team';
        let signature = '';

        if (data.senderId) {
            const [users] = await pool.query('SELECT name, signature FROM users WHERE id = ?', [data.senderId]);
            if (users.length) {
                senderName = users[0].name;
                signature = users[0].signature || '';
            }
        }

        // Fetch ticket details
        const [tickets] = await pool.query(
            `SELECT t.ticket_number, t.category, t.priority, c.id as conv_id
             FROM tickets t
             LEFT JOIN conversations c ON c.ticket_id = t.id AND c.source_channel = 'email'
             WHERE t.id = ? LIMIT 1`,
            [data.ticketId]
        );

        if (!tickets.length) {
            logger.error(`[EmailAdapter] Ticket ${data.ticketId} not found`);
            return;
        }

        const ticket = tickets[0];
        const formattedMessage = data.message.replace(/\n/g, '<br/>');

        // Load CC participants from conversation record
        let ccList = [];
        if (ticket.conv_id) {
            const [convRow] = await pool.query('SELECT cc_emails FROM conversations WHERE id = ?', [ticket.conv_id]);
            const ccRaw = convRow[0]?.cc_emails || '';
            ccList = ccRaw.split(',').map(e => e.trim()).filter(Boolean);
        }

        // Full conversation trail for context
        const trailHtml = await getConversationTrailHtml(pool, data.ticketId);

        // Threading header — subject always includes [TKT-XXXX] so customer
        // clicking Reply keeps the ticket number in the subject line.
        // Gmail rewrites Message-ID but subject-based threading still works.
        const threadRef = `<${ticket.ticket_number}@ticketcrm.local>`;

        const mailOptions = {
            from: `"Support Team" <${process.env.EMAIL_USER}>`,
            to: customerEmail,
            cc: ccList.length ? ccList.join(', ') : undefined,
            subject: `Re: [${ticket.ticket_number}] ${ticket.category}`,
            headers: {
                'In-Reply-To': threadRef,
                'References': threadRef,
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
                    ${signature ? `<div style="margin-top: 20px; color: #64748b; font-size: 13px; border-top: 1px solid #f1f5f9; padding-top: 10px; white-space: pre-line;">--<br/>${signature}</div>` : ''}
                    ${trailHtml}
                    <p style="font-size: 13px; color: #666; margin-top: 24px;">
                        To reply, simply respond to this email — your message will be automatically added to the ticket thread.
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
        logger.info(`📧 [EmailAdapter] Reply sent to ${customerEmail}${ccList.length ? ` (CC: ${ccList.join(', ')})` : ''} for ticket ${ticket.ticket_number}`);

    } catch (error) {
        logger.error(`❌ [EmailAdapter] Failed to send reply email: ${error.message}`);
        throw error;
    }
};
