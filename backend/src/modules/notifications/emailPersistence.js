import connectDB from '../../db/index.js';
import { logger } from '../../logger.js';

export async function logOutgoingEmail(pool, messageId, ticketNumber = null) {
    if (!messageId) return;
    try {
        const cleanMsgId = messageId.replace(/[<>]/g, '').trim();
        await pool.query(
            `INSERT INTO email_logs (message_id, status, error_message) 
             VALUES (?, 'processed', ?) 
             ON DUPLICATE KEY UPDATE status = 'processed'`,
            [cleanMsgId, `Outgoing notification for ${ticketNumber || 'system'}`]
        );
    } catch (err) {
        logger.error(`[EmailService] Failed to log outgoing ID ${messageId}: ${err.message}`);
    }
}

export async function recordConversationSystemMessage(pool, ticketId, messageBody, messageId, inReplyTo, references) {
    if (!ticketId || !messageBody || !messageId) return;

    try {
        const [conv] = await pool.query('SELECT id FROM conversations WHERE ticket_id = ? LIMIT 1', [ticketId]);
        if (!conv.length) return;

        await pool.query(
            `INSERT INTO conversation_messages (conversation_id, sender_type, sender_name, message_body, message_id, in_reply_to, reference_chain)
             VALUES (?, 'system', 'Support Team', ?, ?, ?, ?)`,
            [conv[0].id, messageBody, messageId.replace(/[<>]/g, '').trim(), inReplyTo, references]
        );
    } catch (err) {
        logger.warn(`[EmailService] Failed to record automated trail entry for ticket ${ticketId}: ${err.message}`);
    }
}

export async function persistQueuedOutboundSuccess(metadata = {}) {
    const pool = connectDB();
    const {
        outgoingMessageId,
        ticketNumber,
        ticketId,
        conversationMessageBody,
        inReplyTo,
        references
    } = metadata;

    if (outgoingMessageId) {
        await logOutgoingEmail(pool, outgoingMessageId, ticketNumber || null);
    }

    if (ticketId && conversationMessageBody && outgoingMessageId) {
        await recordConversationSystemMessage(
            pool,
            ticketId,
            conversationMessageBody,
            outgoingMessageId,
            inReplyTo,
            references
        );
    }
}

