// modules/notifications/emailService.js
import { logger } from '../../logger.js';
import connectDB from '../../db/index.js';
import { getConversationTrailHtml } from '../conversations/adapters/emailAdapter.js';
import { resolveSlaPolicy } from '../sla/slaPolicyService.js';
import { renderNotificationTemplate, TEMPLATE_KEYS } from './templateService.js';
import { publishBroadcast } from '../../services/realtimeEvents.js';
import { transporter } from '../../services/mailTransport.js';
import { outboundEmailQueue } from '../../queues/outboundEmailQueue.js';

const SENDER_EMAIL = (process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
const REPLY_TO_EMAIL = (process.env.IMAP_USER || SENDER_EMAIL).trim();
const MAX_PARTICIPANT_NOTIFY = Math.max(1, parseInt(process.env.MAX_PARTICIPANT_NOTIFY || '20', 10));
const COMPANY_NAME = process.env.COMPANY_NAME || 'Ticket CRM Team';
const mailLogColors = {
    outbound: (text) => `\x1b[1;92m${text}\x1b[0m`,
};

const formatDisplayValue = (value, fallback = 'N/A') => value || fallback;

async function enqueueOutboundEmail(type, mailOptions, metadata = {}) {
    const target = mailOptions.to || mailOptions.bcc || mailOptions.cc || 'unknown';
    await outboundEmailQueue.add(
        type,
        {
            mailOptions,
            metadata: {
                ...metadata,
                type,
                target
            }
        },
        {
            jobId: metadata.jobId || `${type}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
        }
    );
    logger.info(mailLogColors.outbound(`📬 OUTBOUND ${type} queued for ${target}`));
}

/**
 * Helper to build threading headers for a specific ticket
 */
export async function buildThreadHeaders(pool, ticketId) {
    const [rows] = await pool.query(
        `SELECT c.root_message_id, cm.message_id as last_msg_id, cm.reference_chain
         FROM conversations c
         LEFT JOIN conversation_messages cm ON cm.conversation_id = c.id
         WHERE c.ticket_id = ?
         ORDER BY
            CASE WHEN c.source_channel = 'email' THEN 0 ELSE 1 END,
            cm.created_at DESC,
            c.id DESC
         LIMIT 1`,
        [ticketId]
    );

    const domain = SENDER_EMAIL?.split('@')[1] || 'ticketcrm.com';
    const newMessageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${domain}>`;

    if (!rows.length || !rows[0].root_message_id) {
        // First email in the thread
        return { messageId: newMessageId, inReplyTo: undefined, references: undefined };
    }

    const { root_message_id, last_msg_id, reference_chain } = rows[0];
    const inReplyTo = last_msg_id || root_message_id;
    const references = ((reference_chain || '') + ' ' + inReplyTo).trim();

    return { messageId: newMessageId, inReplyTo, references };
}

/**
 * Send notification to customer about new ticket — includes conversation trail
 */
export const sendTicketNotification = async (ticket, customerEmail, rootMessageId = null) => {
    if (!customerEmail) return;

    const pool = connectDB();
    const formattedDescription = ticket.description
        ? ticket.description.replace(/\n/g, '<br/>').replace(/\*/g, '')
        : '';

    let headers = { messageId: undefined, inReplyTo: undefined, references: undefined };
    let trailHtml = '';
    let responseTimeSec = 900; // default 15 minutes
    try {
        if (rootMessageId) {
            // If explicit root message provided, reply directly to it
            const domain = SENDER_EMAIL?.split('@')[1] || 'ticketcrm.com';
            headers = {
                messageId: `<${Date.now()}.${Math.random().toString(36).slice(2)}@${domain}>`,
                inReplyTo: rootMessageId,
                references: rootMessageId
            };
        } else {
            headers = await buildThreadHeaders(pool, ticket.id);
        }
        if (ticket.id) trailHtml = await getConversationTrailHtml(pool, ticket.id);

        if (ticket.priority) {
            // Priority is a name like "Critical", we need to find its ID for resolution
            const [prioRows] = await pool.query(`SELECT id FROM priorities WHERE name = ?`, [ticket.priority]);
            if (prioRows.length) {
                const policy = await resolveSlaPolicy(pool, {
                    customerId: ticket.customer_id,
                    projectId: ticket.project_id,
                    priorityId: prioRows[0].id
                });
                if (policy?.first_response_hrs) {
                    responseTimeSec = policy.first_response_hrs * 3600;
                }
            }
        }
    } catch (trailErr) {
        logger.error(`[EmailService] Trail/header build failed for ticket ${ticket.ticket_number}: ${trailErr.message}`);
    }

    // Format response time as human-readable string
    const formatResponseTime = (sec) => {
        if (sec < 60) return `${sec} second(s)`;
        if (sec < 3600) {
            const mins = Math.round(sec / 60);
            return `${mins} minute(s)`;
        }
        const hrs = (sec / 3600).toFixed(1).replace(/\.0$/, '');
        return `${hrs} hour(s)`;
    };
    const responseTimeLabel = formatResponseTime(responseTimeSec);

    let renderedEmail = null;
    try {
        renderedEmail = await renderNotificationTemplate(pool, TEMPLATE_KEYS.ACKNOWLEDGEMENT, {
            ticket_number: formatDisplayValue(ticket.ticket_number),
            ticket_subject: formatDisplayValue(ticket.subject || ticket.category || 'Support Request', 'Support Request'),
            category: formatDisplayValue(ticket.category),
            priority: formatDisplayValue(ticket.priority),
            description_html: formattedDescription || 'No description provided.',
            first_response_target: responseTimeLabel,
            etr: formatDisplayValue(ticket.etr),
            assigned_to_name: formatDisplayValue(ticket.assigned_to_name, 'Support Team'),
            customer_name: formatDisplayValue(ticket.customer_name, 'Customer'),
            company_name: COMPANY_NAME,
            conversation_trail_html: trailHtml,
        });
    } catch (templateErr) {
        logger.warn(`[EmailService] Failed to render acknowledgement template for ${ticket.ticket_number}: ${templateErr.message}`);
    }

    const mailOptions = {
        from: `"Support Team" <${SENDER_EMAIL}>`,
        replyTo: REPLY_TO_EMAIL || undefined,
        to: customerEmail,
        subject: renderedEmail?.subject || `[${ticket.ticket_number}] ${ticket.subject || ticket.category || 'Support Request'}`,
        headers: {
            'Message-ID': headers.messageId,
            'In-Reply-To': headers.inReplyTo,
            'References': headers.references,
            'Auto-Submitted': 'auto-generated',
            'X-Auto-Response-Suppress': 'All'
        },
        html: renderedEmail?.html || `
      <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 680px; margin: 0 auto;">
        <h2 style="color: #4f8ef7; margin-bottom: 4px;">Ticket Acknowledgement</h2>
        <p style="color: #64748b; margin-top: 0;">Your request has been received (Ticket ${ticket.ticket_number}). Our team will respond shortly.</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b; width:40%"><strong>Ticket Number</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.ticket_number}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Category</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.category}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Priority</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.priority}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>First Response Target</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${responseTimeLabel}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>ETR (Deadline)</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.etr}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b; vertical-align:top"><strong>Description</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; white-space: pre-wrap;">${formattedDescription}</td></tr>
        </table>

        <p style="font-size: 13px; color: #666;">
          To reply or add more details, simply respond to this email — your message will automatically be added to the ticket.
        </p>

        ${trailHtml}

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">
          Regards,<br/>${COMPANY_NAME}
        </p>
      </div>
    `
    };

    try {
        await enqueueOutboundEmail('ticket_notification', mailOptions, {
            ticketId: ticket.id,
            ticketNumber: ticket.ticket_number,
            outgoingMessageId: headers.messageId,
            inReplyTo: headers.inReplyTo,
            references: headers.references,
            conversationMessageBody: 'Automated Acknowledgement Sent',
            jobId: `ticket_notification:${ticket.ticket_number}:${headers.messageId}`
        });
    } catch (error) {
        logger.error(`❌ Failed to send notification email: ${error.message}`);
    }
};


/**
 * Send notification to customer when their ticket is assigned to an agent
 */
export const sendTicketAssignedNotification = async (ticket, customerEmail, agentName) => {
    if (!customerEmail || !agentName) return;

    const pool = connectDB();
    let headers = { messageId: undefined, inReplyTo: undefined, references: undefined };
    let trailHtml = '';
    try {
        headers = await buildThreadHeaders(pool, ticket.id);
        if (ticket.id) trailHtml = await getConversationTrailHtml(pool, ticket.id);
    } catch (err) {
        logger.error(`[EmailService] Trail/header build failed for assignment notification ${ticket.ticket_number}: ${err.message}`);
    }

    let renderedEmail = null;
    try {
        renderedEmail = await renderNotificationTemplate(pool, TEMPLATE_KEYS.ASSIGNMENT, {
            ticket_number: formatDisplayValue(ticket.ticket_number),
            ticket_subject: formatDisplayValue(ticket.subject || ticket.category || 'Support Request', 'Support Request'),
            category: formatDisplayValue(ticket.category),
            priority: formatDisplayValue(ticket.priority),
            description_html: '',
            first_response_target: '',
            etr: formatDisplayValue(ticket.etr, 'Pending'),
            assigned_to_name: formatDisplayValue(agentName, 'Support Team'),
            customer_name: formatDisplayValue(ticket.customer_name, 'Customer'),
            company_name: COMPANY_NAME,
            conversation_trail_html: trailHtml,
        });
    } catch (templateErr) {
        logger.warn(`[EmailService] Failed to render assignment template for ${ticket.ticket_number}: ${templateErr.message}`);
    }

    const mailOptions = {
        from: `"Support Team" <${SENDER_EMAIL}>`,
        replyTo: REPLY_TO_EMAIL || undefined,
        to: customerEmail,
        subject: renderedEmail?.subject || `Re: [${ticket.ticket_number}] ${ticket.subject || ticket.category || 'Support Request'}`,
        headers: {
            'Message-ID': headers.messageId,
            'In-Reply-To': headers.inReplyTo,
            'References': headers.references,
            'Auto-Submitted': 'auto-generated',
            'X-Auto-Response-Suppress': 'All'
        },
        html: renderedEmail?.html || `
      <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 680px; margin: 0 auto;">
        <h2 style="color: #4f8ef7; margin-bottom: 4px;">Agent Assigned to Your Ticket</h2>
        <p style="color: #64748b; margin-top: 0;">Good news! Your support request has been assigned to a team member.</p>
        <div style="background:#f0fdf4; padding: 15px; border-radius:8px; border:1px solid #bbf7d0; margin: 20px 0;">
            <p style="margin:0; font-size:14px; color:#166534;">
                <strong>${agentName}</strong> has been assigned to handle your ticket <strong>${ticket.ticket_number}</strong>.
            </p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b; width:40%"><strong>Ticket Number</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.ticket_number}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Subject</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.subject || ticket.category}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Assigned To</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${agentName}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>ETR (Deadline)</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.etr || 'Pending'}</td></tr>
        </table>
        <p style="font-size: 13px; color: #666;">To add more details, simply reply to this email.</p>
        ${trailHtml}
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
        <p style="font-size: 12px; color: #94a3b8;">Regards,<br/>${COMPANY_NAME}</p>
      </div>
    `
    };

    try {
        await enqueueOutboundEmail('assignment_notification', mailOptions, {
            ticketId: ticket.id,
            ticketNumber: ticket.ticket_number,
            outgoingMessageId: headers.messageId,
            inReplyTo: headers.inReplyTo,
            references: headers.references,
            conversationMessageBody: `Ticket assigned to ${agentName}`,
            jobId: `assignment_notification:${ticket.ticket_number}:${headers.messageId}`
        });
    } catch (error) {
        logger.error(`❌ Failed to send assignment notification: ${error.message}`);
    }
};

/**
 * Send notification to customer when their ticket's SLA has been breached
 */
export const sendSlaBreachNotification = async (ticket, customerEmail) => {
    if (!customerEmail) return;

    const pool = connectDB();
    let headers = { messageId: undefined, inReplyTo: undefined, references: undefined };
    let trailHtml = '';
    try {
        headers = await buildThreadHeaders(pool, ticket.id);
        if (ticket.id) trailHtml = await getConversationTrailHtml(pool, ticket.id);
    } catch (err) {
        logger.error(`[EmailService] Trail/header build failed for SLA breach notification ${ticket.ticket_number}: ${err.message}`);
    }

    let renderedEmail = null;
    try {
        renderedEmail = await renderNotificationTemplate(pool, TEMPLATE_KEYS.SLA_BREACH, {
            ticket_number: formatDisplayValue(ticket.ticket_number),
            ticket_subject: formatDisplayValue(ticket.subject || ticket.category || 'Support Request', 'Support Request'),
            category: formatDisplayValue(ticket.category),
            priority: formatDisplayValue(ticket.priority),
            description_html: '',
            first_response_target: '',
            etr: formatDisplayValue(ticket.etr),
            assigned_to_name: formatDisplayValue(ticket.assigned_to_name || ticket.assigned_to_name_display, 'Support Team'),
            customer_name: formatDisplayValue(ticket.customer_name, 'Customer'),
            company_name: COMPANY_NAME,
            conversation_trail_html: trailHtml,
        });
    } catch (templateErr) {
        logger.warn(`[EmailService] Failed to render SLA breach template for ${ticket.ticket_number}: ${templateErr.message}`);
    }

    const mailOptions = {
        from: `"Support Team" <${SENDER_EMAIL}>`,
        replyTo: REPLY_TO_EMAIL || undefined,
        to: customerEmail,
        subject: renderedEmail?.subject || `Re: [${ticket.ticket_number}] ${ticket.subject || ticket.category || 'Support Request'}`,
        headers: {
            'Message-ID': headers.messageId,
            'In-Reply-To': headers.inReplyTo,
            'References': headers.references,
            'Auto-Submitted': 'auto-generated',
            'X-Auto-Response-Suppress': 'All'
        },
        html: renderedEmail?.html || `
      <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 680px; margin: 0 auto;">
        <h2 style="color: #dc2626; margin-bottom: 4px;">Ticket Escalated</h2>
        <p style="color: #64748b; margin-top: 0;">We sincerely apologize — your support request has exceeded its expected resolution time.</p>
        <div style="background:#fef2f2; padding: 15px; border-radius:8px; border:1px solid #fecaca; margin: 20px 0;">
            <p style="margin:0; font-size:14px; color:#991b1b;">
                Your ticket <strong>${ticket.ticket_number}</strong> has been automatically escalated for priority resolution.
            </p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b; width:40%"><strong>Ticket Number</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.ticket_number}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Subject</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.subject || ticket.category}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Priority</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.priority}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Assigned To</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.assigned_to_name || 'Support Team'}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Original Deadline</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.etr || 'N/A'}</td></tr>
        </table>
        <p style="font-size: 13px; color: #666;">We are working to resolve your issue as quickly as possible.</p>
        ${trailHtml}
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
        <p style="font-size: 12px; color: #94a3b8;">Regards,<br/>${COMPANY_NAME}</p>
      </div>
    `
    };

    try {
        await enqueueOutboundEmail('sla_breach_notification', mailOptions, {
            ticketId: ticket.id,
            ticketNumber: ticket.ticket_number,
            outgoingMessageId: headers.messageId,
            inReplyTo: headers.inReplyTo,
            references: headers.references,
            conversationMessageBody: 'SLA Breached — Ticket escalated for priority resolution',
            jobId: `sla_breach_notification:${ticket.ticket_number}:${headers.messageId}`
        });
    } catch (error) {
        logger.error(`❌ Failed to send SLA breach notification: ${error.message}`);
    }
};


/**
 * Sync participant replies across all parties (Primary Customer + CCs)
 */
export const sendParticipantReplyNotification = async (ticket, senderEmail, messageBody) => {
    if (!ticket?.id) {
        logger.warn('[EmailService] sendParticipantReplyNotification called without ticket.id');
        return;
    }
    const pool = connectDB();
    try {
        const [rows] = await pool.query(
            `SELECT c.email as primary_email, cv.id as conv_id
             FROM tickets t
             LEFT JOIN customers c ON t.customer_id = c.id
             LEFT JOIN conversations cv ON cv.ticket_id = t.id AND cv.source_channel = 'email'
             WHERE t.id = ?`,
            [ticket.id]
        );

        if (!rows.length) return;
        const { primary_email, conv_id } = rows[0];

        // Fetch CCs from Relational Model
        const [participants] = await pool.query(
            "SELECT email FROM conversation_participants WHERE conversation_id = ?",
            [conv_id]
        );
        const allRecipients = new Set(participants.map(p => p.email.toLowerCase().trim()));
        // if (primary_email) allRecipients.add(primary_email.toLowerCase().trim());

        // Remove the person who just replied
        if (senderEmail) allRecipients.delete(senderEmail.toLowerCase().trim());

        if (allRecipients.size === 0) return;

        // Deterministic order before cap to avoid random truncation behavior.
        const recipientList = Array.from(allRecipients).sort((a, b) => a.localeCompare(b));
        const cappedRecipients = recipientList.slice(0, MAX_PARTICIPANT_NOTIFY);
        if (recipientList.length > cappedRecipients.length) {
            logger.warn(`[EmailService] Participant notification capped for ${ticket.ticket_number}: ${recipientList.length} -> ${cappedRecipients.length}`);
        }

        const headers = await buildThreadHeaders(pool, ticket.id);
        const trailHtml = await getConversationTrailHtml(pool, ticket.id);
        const formattedMsg = (messageBody || '').replace(/\n/g, '<br/>');

        const mailOptions = {
            from: `"Ticket CRM Support" <${SENDER_EMAIL}>`,
            replyTo: REPLY_TO_EMAIL || undefined,
            to: cappedRecipients.join(', '),
            subject: `Re: [${ticket.ticket_number}] ${ticket.subject || ticket.category || 'Support Request'}`,
            headers: {
                'Message-ID': headers.messageId,
                'In-Reply-To': headers.inReplyTo,
                'References': headers.references,
                'Auto-Submitted': 'auto-generated',
                'X-Auto-Response-Suppress': 'All'
            },
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #333;">
                <p style="font-size: 14px; color: #475569; margin-bottom: 20px;">
                  New update on ticket <strong>${ticket.ticket_number}</strong>:
                </p>
                <div style="background: #f8fafc; padding: 15px; border-left: 4px solid #3b82f6; border-radius: 4px; margin-bottom: 25px;">
                  ${formattedMsg}
                </div>
                
                ${trailHtml}
                
                <p style="font-size: 12px; color: #94a3b8; margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 10px;">
                  To reply, respond directly to this email. All participants will be notified.
                </p>
              </div>
            `
        };

        await enqueueOutboundEmail('participant_reply_notification', mailOptions, {
            ticketNumber: ticket.ticket_number,
            outgoingMessageId: headers.messageId,
            inReplyTo: headers.inReplyTo,
            references: headers.references,
            jobId: `participant_reply_notification:${ticket.ticket_number}:${headers.messageId}`
        });

    } catch (err) {
        logger.error(`❌ Failed to send participant sync notification: ${err.message}`);
    }
};

/**
 * Send notification to customer about ticket status update
 */
export const sendTicketStatusNotification = async (ticket, customerEmail, oldStatus, newStatus) => {
    if (!customerEmail) return;

    const pool = connectDB();
    let headers = { messageId: undefined, inReplyTo: undefined, references: undefined };
    let trailHtml = '';
    try {
        headers = await buildThreadHeaders(pool, ticket.id);
        trailHtml = await getConversationTrailHtml(pool, ticket.id);
    } catch (trailErr) {
        logger.error(`[EmailService] Trail/header build failed for status notification ${ticket.ticket_number}: ${trailErr.message}`);
    }

    const statusLabel = newStatus.replace('_', ' ').toUpperCase();

    const mailOptions = {
        from: `"Support Team" <${SENDER_EMAIL}>`,
        replyTo: REPLY_TO_EMAIL || undefined,
        to: customerEmail,
        subject: `Re: [${ticket.ticket_number}] ${ticket.category}`,
        headers: {
            'Message-ID': headers.messageId,
            'In-Reply-To': headers.inReplyTo,
            'References': headers.references,
            'Auto-Submitted': 'auto-generated',
            'X-Auto-Response-Suppress': 'All'
        },
        html: `
      <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 680px; margin: 0 auto;">
        <h2 style="color: #4f8ef7; margin-bottom: 4px;">Ticket Status Updated</h2>
        <div style="background:#f8fafc; padding: 15px; border-radius:8px; border:1px solid #e2e8f0; margin: 20px 0;">
            <p style="margin:0; font-size:14px; color:#1e293b;">
                The status of ticket <strong>${ticket.ticket_number}</strong> has changed:
            </p>
            <div style="margin-top:12px;">
                <span style="background:#e2e8f0; padding:4px 8px; border-radius:4px; font-size:12px; text-decoration:line-through;">${oldStatus.toUpperCase()}</span>
                <span style="margin:0 10px; color:#64748b;">➔</span>
                <span style="background:#0284c7; color:white; padding:4px 8px; border-radius:4px; font-size:12px; font-weight:bold;">${statusLabel}</span>
            </div>
        </div>
        
        ${trailHtml}
        
        <p style="font-size: 13px; color: #64748b; margin-top:25px;">Regards,<br/>${COMPANY_NAME}</p>
      </div>
    `
    };

    try {
        await enqueueOutboundEmail('status_update_notification', mailOptions, {
            ticketNumber: ticket.ticket_number,
            outgoingMessageId: headers.messageId,
            inReplyTo: headers.inReplyTo,
            references: headers.references,
            jobId: 'status_update_notification:' + ticket.ticket_number + ':' + headers.messageId
        });
    } catch (error) {
        logger.error(`Failed to send status update email: ${error.message}`);
    }
};

/**
 * Send Emergency Broadcast to all active users (In-App, WebSocket, Email)
 */
export const sendEmergencyBroadcast = async (ticket) => {
    const pool = connectDB();
    try {
        // Fetch all active staff
        const [users] = await pool.query(`SELECT id, email, name FROM users WHERE is_active = 1`);

        // 1. WebSocket Broadcast
        try {
            publishBroadcast('emergency_alert', {
                ticket_id: ticket.id || null,
                ticket_number: ticket.ticket_number,
                category: ticket.category,
                priority: ticket.priority,
                message: "🚨 EMERGENCY: P1 Ticket Created!"
            });
            logger.info(`📡 WebSocket emergency_alert emitted to all connected clients`);
        } catch (err) { logger.warn(`Emergency socket failed: ${err.message}`); }

        // 2. In-App Notifications
        try {
            const { createNotification } = await import('./notificationController.js');
            for (const user of users) {
                await createNotification(pool, {
                    user_id: user.id,
                    type: 'emergency',
                    title: `🚨 EMERGENCY: ${ticket.ticket_number}`,
                    body: `P1 Ticket Created: ${ticket.category}. Please check immediately.`,
                    entity_id: ticket.id || null
                });
            }
        } catch (err) { logger.warn(`Emergency db notification failed: ${err.message}`); }

        // 3. Email Blast
        const emails = users.map(u => u.email).filter(Boolean);
        if (emails.length > 0) {
            const mailOptions = {
                from: `"Ticket CRM Emergency" <${SENDER_EMAIL}>`,
                bcc: emails.join(','), // BCC to not expose everyone's email and keep headers clean
                subject: `🚨 EMERGENCY P1 TICKET: [${ticket.ticket_number}] ${ticket.category}`,
                headers: {
                    'Auto-Submitted': 'auto-generated',
                    'X-Auto-Response-Suppress': 'All'
                },
                html: `
                  <div style="font-family: sans-serif; padding: 20px; color: #333; border: 2px solid red;">
                    <h2 style="color: red;">🚨 EMERGENCY DETECTED</h2>
                    <p>A new priority P1 ticket has been created and requires immediate attention.</p>
                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                      <tr><td style="padding: 8px; border-bottom: 1px solid #ccc;"><strong>Ticket Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ccc;">${ticket.ticket_number}</td></tr>
                      <tr><td style="padding: 8px; border-bottom: 1px solid #ccc;"><strong>Subject:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ccc;">${ticket.category}</td></tr>
                      <tr><td style="padding: 8px; border-bottom: 1px solid #ccc;"><strong>Description:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ccc;">${ticket.description || "N/A"}</td></tr>
                    </table>
                    <p>Please log in to the portal and claim this ticket immediately to begin resolution.</p>
                  </div>
                `
            };
            await enqueueOutboundEmail('emergency_broadcast', mailOptions, {
                target: `${emails.length} users`,
                jobId: `emergency_broadcast:${ticket.ticket_number}:${Date.now()}`
            });
        }
    } catch (err) {
        logger.error(`❌ Failed to send emergency broadcast: ${err.message}`);
    }
};

/**
 * Send Emergency Claimed Broadcast to all active users to stand down
 */
export const sendEmergencyClaimedBroadcast = async (ticket, claimedByName) => {
    logger.info(`📢 Starting Stand-Down Broadcast for ${ticket.ticket_number} claimed by ${claimedByName}`);
    const pool = connectDB();
    try {
        const [users] = await pool.query(`SELECT id, email, name FROM users WHERE is_active = 1`);
        logger.info(`   -> Found ${users.length} active users to notify.`);

        // 1. In-App Notifications
        try {
            const { createNotification } = await import('./notificationController.js');
            for (const user of users) {
                await createNotification(pool, {
                    user_id: user.id,
                    type: 'info',
                    title: `✅ UPDATE: Emergency Ticket Claimed`,
                    body: `The P1 Ticket ${ticket.ticket_number} has been claimed by ${claimedByName}.`,
                    entity_id: ticket.id || null
                });
            }
            logger.info(`   -> In-App Notifications created for all users.`);
        } catch (err) { logger.warn(`Emergency claim notification failed: ${err.message}`); }

        // 2. Email Blast
        const emails = users.map(u => u.email).filter(Boolean);
        if (emails.length > 0) {
            logger.info(`   -> Sending Stand-Down Email Blast to ${emails.length} recipients...`);
            const mailOptions = {
                from: `"Ticket CRM Support" <${SENDER_EMAIL}>`,
                bcc: emails.join(','),
                subject: `✅ UPDATE - P1 TICKET CLAIMED: [${ticket.ticket_number}]`,
                headers: {
                    'Auto-Submitted': 'auto-generated',
                    'X-Auto-Response-Suppress': 'All'
                },
                html: `
                  <div style="font-family: sans-serif; padding: 20px; color: #333; border: 2px solid #16a34a; background-color: #f0fdf4;">
                    <h2 style="color: #16a34a;">✅ EMERGENCY CLAIMED - STAND DOWN</h2>
                    <p>The P1 emergency ticket <strong>${ticket.ticket_number}</strong> has been successfully claimed by <strong>${claimedByName}</strong>.</p>
                    <p>No further action is required from the rest of the team at this time. You may resume your normal activities.</p>
                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                      <tr><td style="padding: 8px; border-bottom: 1px solid #ccc;"><strong>Ticket Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ccc;">${ticket.ticket_number}</td></tr>
                      <tr><td style="padding: 8px; border-bottom: 1px solid #ccc;"><strong>Subject:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ccc;">${ticket.category}</td></tr>
                      <tr><td style="padding: 8px; border-bottom: 1px solid #ccc;"><strong>Claimed By:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ccc;">${claimedByName}</td></tr>
                    </table>
                  </div>
                `
            };
            await enqueueOutboundEmail('emergency_claimed_broadcast', mailOptions, {
                target: `${emails.length} users`,
                jobId: `emergency_claimed_broadcast:${ticket.ticket_number}:${Date.now()}`
            });
        }
    } catch (err) {
        logger.error(`❌ Failed to send emergency claimed broadcast: ${err.message}`);
    }
};

/**
 * Send Welcome Email to newly created staff/user
 */
export const sendWelcomeEmail = async (user, plainPassword) => {
    if (!user.email) return;

    const mailOptions = {
        from: `"Ticket CRM Admin" <${SENDER_EMAIL}>`,
        to: user.email,
        subject: `Welcome to Ticket CRM, ${user.name}!`,
        html: `
      <div style="font-family: sans-serif; padding: 30px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f8ef7; margin-bottom: 20px;">Welcome to the Team!</h2>
        <p>Hello <strong>${user.name}</strong>,</p>
        <p>Your account has been created successfully. You can now log in to the Ticket CRM using the credentials below:</p>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Login URL:</strong> <a href="${process.env.FRONTEND_URL}/login">${process.env.FRONTEND_URL}/login</a></p>
          <p style="margin: 0 0 10px 0;"><strong>Email:</strong> ${user.email}</p>
          <p style="margin: 0 0 10px 0;"><strong>Password:</strong> <code style="background: #e2e8f0; padding: 2px 4px; border-radius: 4px;">${plainPassword}</code></p>
          <p style="margin: 0;"><strong>Role:</strong> <span style="text-transform: uppercase; font-weight: bold; color: #4f8ef7;">${user.role}</span></p>
        </div>

        <p>Please secure your credentials and log in to get started.</p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;"/>
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">
          Sent by Ticket CRM System<br/>
          &copy; ${new Date().getFullYear()} ${COMPANY_NAME}
        </p>
      </div>
    `
    };

    try {
        await transporter.sendMail(mailOptions);
        logger.info(mailLogColors.outbound(`📧 OUTBOUND welcome email sent to ${user.email}`));
    } catch (error) {
        logger.error(`❌ Failed to send welcome email to ${user.email}: ${error.message}`);
    }
};

/**
 * Send Password Reset Email with time-limited link
 */
export const sendForgotPasswordEmail = async (user, resetLink) => {
    if (!user.email) return;

    const mailOptions = {
        from: `"Ticket CRM Support" <${SENDER_EMAIL}>`,
        to: user.email,
        subject: `Password Reset Request - Ticket CRM`,
        html: `
      <div style="font-family: sans-serif; padding: 30px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f8ef7; margin-bottom: 20px;">Password Reset</h2>
        <p>Hello <strong>${user.name}</strong>,</p>
        <p>You recently requested to reset your password for your Ticket CRM account. Click the button below to proceed:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #4f8ef7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>

        <p style="font-size: 13px; color: #64748b;">
          This link will expire in 1 hour. If you did not request a password reset, please ignore this email.
        </p>
        
        <p style="font-size: 13px; color: #64748b;">
          If the button above doesn't work, copy and paste this link into your browser:<br/>
          <span style="word-break: break-all; color: #4f8ef7;">${resetLink}</span>
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;"/>
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">
          Sent by Ticket CRM Support<br/>
          &copy; ${new Date().getFullYear()} ${COMPANY_NAME}
        </p>
      </div>
    `
    };

    try {
        await transporter.sendMail(mailOptions);
        logger.info(mailLogColors.outbound(`📧 OUTBOUND forgot password email sent to ${user.email}`));
    } catch (error) {
        logger.error(`❌ Failed to send forgot password email to ${user.email}: ${error.message}`);
    }
};
