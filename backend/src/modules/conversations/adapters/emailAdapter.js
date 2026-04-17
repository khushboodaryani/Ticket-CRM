// src/modules/conversations/adapters/emailAdapter.js
// Sends agent replies back to customers via email

import nodemailer from 'nodemailer';
import { logger } from '../../../logger.js';
import { logOutgoingEmail } from '../../notifications/emailService.js';
import connectDB from '../../../db/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ATTACHMENT_DIR = path.resolve(__dirname, '../../../../public/attachments');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

const REPLY_TO_EMAIL = (process.env.GMAIL_USER || process.env.EMAIL_USER || '').trim();

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
                `SELECT * FROM (
                    SELECT cm.created_at, cm.message_body, cm.sender_type, cm.sender_name as guest_name,
                           u.name as agent_name
                    FROM conversation_messages cm
                    LEFT JOIN users u ON cm.sender_id = u.id
                    WHERE cm.conversation_id IN (?) AND cm.is_internal_note = 0
                    ORDER BY cm.created_at DESC
                    LIMIT 30
                 ) recent ORDER BY recent.created_at ASC`,
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
            const dateStr = item.ts.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

            if (item.type === 'event') {
                return `
                <tr>
                  <td style="padding:10px 15px; border-bottom:1px solid #f1f5f9;">
                    <div style="display:inline-block; background:#f8fafc; border:1px solid #e2e8f0; 
                                color:#64748b; font-size:11px; padding:4px 10px; border-radius:15px; font-weight:500;">
                      📅 ${item.note}
                    </div>
                    <span style="font-size:10px; color:#94a3b8; margin-left:10px;">${dateStr}</span>
                  </td>
                </tr>`;
            }

            // message row
            const isAgent = item.senderType === 'agent';
            const bgColor = isAgent ? '#f0f9ff' : '#ffffff';
            const accentColor = isAgent ? '#0284c7' : '#64748b';
            return `
                <tr>
                  <td style="padding:15px; border-bottom:1px solid #f1f5f9; background:${bgColor};">
                    <div style="margin-bottom:8px;">
                      <span style="font-size:12px; font-weight:700; color:#1e293b;">${item.sender}</span>
                      <span style="font-size:11px; color:#94a3b8; margin-left:8px;">${dateStr}</span>
                    </div>
                    <div style="font-size:13px; color:#334155; line-height:1.6; border-left:3px solid ${accentColor}; padding-left:12px;">
                      ${item.body}
                    </div>
                  </td>
                </tr>`;
        }).join('');

        return `
        <div style="margin-top:30px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
          <div style="background:#f8fafc; padding:10px 15px; border-bottom:1px solid #e2e8f0; font-size:12px; font-weight:600; color:#475569;">
             Conversation History
          </div>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
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
 */
export const send = async (customerEmail, data) => {
    if (!customerEmail || (!data.message && !data.messageId)) {
        logger.warn('[EmailAdapter] Missing customerEmail or content');
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

        // 1. Fetch ticket and conversation metadata for threading
        const [tickets] = await pool.query(
            `SELECT t.ticket_number, t.subject, t.category, t.priority, c.id as conv_id, c.root_message_id
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
        let convId = ticket.conv_id;
        const subjectLine = ticket.subject || ticket.category;

        // Guard: If ticket has no email conversation yet (e.g. manually created), create one
        if (!convId) {
            logger.info(`[EmailAdapter] No email conversation found for ticket ${data.ticketId}. Creating one.`);
            const [cvRes] = await pool.query(
                `INSERT INTO conversations (ticket_id, source_channel) VALUES (?, 'email')`,
                [data.ticketId]
            );
            convId = cvRes.insertId;
        }

        // 2. Build Threading Chain (Strict Logic)
        const [lastMsg] = await pool.query(
            `SELECT message_id, reference_chain FROM conversation_messages 
             WHERE conversation_id = ? AND message_id IS NOT NULL 
             ORDER BY created_at DESC LIMIT 1`,
            [convId]
        );

        const domain = process.env.EMAIL_USER?.split('@')[1] || 'multycomm.com';
        const newMessageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${domain}>`;
        let inReplyTo = ticket.root_message_id;
        let references = ticket.root_message_id;

        if (lastMsg.length) {
            inReplyTo = lastMsg[0].message_id;
            const prevChain = lastMsg[0].reference_chain || '';
            references = (prevChain + ' ' + inReplyTo).trim();
        }

        // 3. Load & Sync Outbound Participants (Relational Model)
        const [participants] = await pool.query(
            "SELECT email FROM conversation_participants WHERE conversation_id = ? AND type = 'cc'",
            [convId]
        );
        const ccList = participants.map(p => p.email).filter(Boolean);

        // Store everyone we're sending TO + CC so we recognize them if they reply later
        // OPT-OUT PROTECTION: Check the removals table first to avoid re-adding unsubscribed users
        const recipientsToSync = [customerEmail, ...ccList].filter(Boolean);
        for (const email of recipientsToSync) {
            const normalized = email.toLowerCase().trim();
            const [removals] = await pool.query(
                "SELECT id FROM conversation_participant_removals WHERE conversation_id = ? AND email = ? LIMIT 1",
                [convId, normalized]
            );

            if (!removals.length) {
                await pool.query(
                    "INSERT IGNORE INTO conversation_participants (conversation_id, email, type) VALUES (?, ?, 'cc')",
                    [convId, normalized]
                );
            } else {
                logger.info(`[EmailAdapter] Skipping opt-out recipient: ${normalized}`);
            }
        }

        // 4. Trail and Body
        const trailHtml = await getConversationTrailHtml(pool, data.ticketId);
        const formattedMessage = data.message.replace(/\n/g, '<br/>');

        // 4.5 Fetch Attachments for Outbound
        let emailAttachments = [];
        if (data.messageId) {
            const [attRows] = await pool.query(
                `SELECT original_name, storage_path FROM conversation_message_attachments 
                 WHERE message_id = ? AND is_deleted = 0 AND visibility = 'public'`,
                [data.messageId]
            );
            emailAttachments = attRows.map(att => ({
                filename: att.original_name,
                path: path.join(ATTACHMENT_DIR, att.storage_path)
            }));
        }

        const mailOptions = {
            from: `"Support Team" <${process.env.EMAIL_USER}>`,
            replyTo: REPLY_TO_EMAIL || undefined,
            to: customerEmail,
            cc: ccList.length ? ccList.join(', ') : undefined,
            subject: `Re: [${ticket.ticket_number}] ${subjectLine}`,
            headers: {
                'Message-ID': newMessageId,
                'In-Reply-To': inReplyTo,
                'References': references,
                'Auto-Submitted': 'auto-generated',
                'X-Auto-Response-Suppress': 'All'
            },
            attachments: emailAttachments,
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 800px; margin: 0 auto;">
                    <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 15px; margin-bottom: 20px;">
                        <h2 style="color: #0f172a; margin: 0; font-size: 18px;">Ticket Update: ${ticket.ticket_number}</h2>
                    </div>
                    
                    <div style="background: #ffffff; padding: 0; border-radius: 8px; line-height: 1.6;">
                        ${formattedMessage}
                    </div>

                    ${signature ? `<div style="margin-top: 30px; color: #64748b; font-size: 13px; border-top: 1px solid #f1f5f9; padding-top: 15px; font-style: italic;">--<br/>${signature}</div>` : ''}
                    
                    ${trailHtml}
                    
                    <div style="margin-top: 30px; padding: 15px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
                        <strong>Reply Tip:</strong> Respond directly to this email to update your ticket.
                        <br/>Ticket subject: <em>${subjectLine}</em>
                    </div>
                </div>
            `
        };

        // 5. UNIFIED PERSISTENCE (Update existing DB record instead of creating duplicate)
        // We use the dbMessageId (data.messageId) passed from the controller
        const dbMessageId = data.messageId;
        if (dbMessageId) {
            await pool.query(
                `UPDATE conversation_messages 
                 SET message_id = ?, in_reply_to = ?, reference_chain = ?, is_sent = 0
                 WHERE id = ?`,
                [newMessageId, inReplyTo, references, dbMessageId]
            );
        } else {
            // Fallback: If for some reason no ID was passed, we create one (should not happen in standard flow)
            const [fallbackRes] = await pool.query(
                `INSERT INTO conversation_messages 
                 (conversation_id, sender_type, sender_id, sender_name, message_body, message_id, in_reply_to, reference_chain, is_sent)
                 VALUES (?, 'agent', ?, ?, ?, ?, ?, ?, 0)`,
                [convId, data.senderId, senderName, data.message, newMessageId, inReplyTo, references]
            );
            data.messageId = fallbackRes.insertId;
        }

        // 6. ASYNC SMTP TRANSMISSION (Non-blocking Background Task)
        transporter.sendMail(mailOptions)
            .then(async () => {
                // Mark as successfully sent in DB
                await pool.query(
                    `UPDATE conversation_messages SET is_sent = 1 WHERE id = ?`,
                    [data.messageId]
                );
                logger.info(`📧 [EmailAdapter] Async Reply successfully delivered: ${newMessageId}`);
            })
            .catch(mailErr => {
                logger.error(`❌ [EmailAdapter] Async SMTP failed: ${mailErr.message} (DB ID: ${data.messageId})`);
                // is_sent remains 0 for audit/retry
            });

        logger.info(`✅ [EmailAdapter] Reply headers attached to DB record ${data.messageId} and queued for delivery: ${ticket.ticket_number}`);
        return { success: true, messageId: data.messageId };

    } catch (error) {
        logger.error(`❌ [EmailAdapter] Error in outbound flow: ${error.message}`);
        throw error;
    }
};
