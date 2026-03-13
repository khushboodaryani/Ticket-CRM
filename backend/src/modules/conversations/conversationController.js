import connectDB from "../../db/index.js";
import { createNotification } from "../notifications/notificationController.js";
import { broadcast } from "../../services/socketService.js";

/**
 * Get or create conversation for a ticket
 * Internal helper used by other functions
 */
async function getOrCreateConversation(pool, ticketId, sourceChannel = 'manual') {
    const [existing] = await pool.query(
        `SELECT * FROM conversations WHERE ticket_id=? LIMIT 1`,
        [ticketId]
    );
    if (existing.length) return existing[0];

    // Fetch ticket data for source_channel and participant_identity
    const [ticketRows] = await pool.query(
        `SELECT t.source, c.email as customer_email FROM tickets t
         LEFT JOIN customers c ON t.customer_id = c.id
         WHERE t.id=?`,
        [ticketId]
    );
    const ticket = ticketRows[0];
    const channel = ticket?.source || sourceChannel;
    const participantIdentity = ticket?.customer_email || null;

    const [result] = await pool.query(
        `INSERT INTO conversations (ticket_id, source_channel, participant_identity) VALUES (?,?,?)`,
        [ticketId, channel, participantIdentity]
    );
    const [newConv] = await pool.query(`SELECT * FROM conversations WHERE id=?`, [result.insertId]);
    return newConv[0];
}

// GET /api/tickets/:ticketId/conversation
export const getConversation = async (req, res) => {
    try {
        const pool = connectDB();
        const ticketId = req.params.ticketId;

        // Ensure ticket exists
        const [ticketRows] = await pool.query(`SELECT id FROM tickets WHERE id=?`, [ticketId]);
        if (!ticketRows.length) return res.status(404).json({ success: false, message: "Ticket not found." });

        const conversation = await getOrCreateConversation(pool, ticketId);

        const [messages] = await pool.query(
            `SELECT cm.*, u.name as sender_name
             FROM conversation_messages cm
             LEFT JOIN users u ON cm.sender_id = u.id
             WHERE cm.conversation_id=?
             ORDER BY cm.created_at ASC`,
            [conversation.id]
        );

        return res.json({ success: true, conversation, messages });
    } catch (err) {
        console.error("getConversation:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/tickets/:ticketId/conversation/messages
export const addMessage = async (req, res) => {
    const { message_body, is_internal_note } = req.body;
    if (!message_body?.trim()) return res.status(400).json({ success: false, message: "message_body is required." });

    try {
        const pool = connectDB();
        const ticketId = req.params.ticketId;

        const [ticketRows] = await pool.query(
            `SELECT t.*, u.name as assigned_to_name, c.email as customer_email FROM tickets t
             LEFT JOIN customers c ON t.customer_id = c.id
             LEFT JOIN users u ON t.assigned_to = u.id
             WHERE t.id=?`,
            [ticketId]
        );
        if (!ticketRows.length) return res.status(404).json({ success: false, message: "Ticket not found." });
        const ticket = ticketRows[0];

        const conversation = await getOrCreateConversation(pool, ticketId);
        const isInternal = is_internal_note ? 1 : 0;

        const [msgResult] = await pool.query(
            `INSERT INTO conversation_messages
             (conversation_id, sender_id, sender_type, message_body, is_internal_note)
             VALUES (?,?,?,?,?)`,
            [conversation.id, req.user.userId, 'agent', message_body.trim(), isInternal]
        );

        const messageId = msgResult.insertId;

        // Broadcast real-time message event (Internal CRM Frontend)
        broadcast("new_message", {
            id: messageId,
            conversation_id: conversation.id,
            ticket_id: ticketId,
            sender_id: req.user.userId,
            sender_name: req.user.name,
            sender_type: 'agent',
            message_body: message_body.trim(),
            is_internal_note: isInternal,
            created_at: new Date()
        });

        // Trigger Outbound Channel Adapter if not internal
        if (!isInternal) {
            import("../../services/messagingService.js").then(m => {
                m.handleOutbound(conversation.id, { message: message_body.trim() });
            }).catch(e => console.error("Outbound trigger failed:", e));
        }

        // Log to ticket activity
        await pool.query(
            `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,?,?,?)`,
            [ticketId, isInternal ? 'internal_note_added' : 'comment_added', req.user.userId,
             isInternal ? 'Internal note added' : 'Reply added to conversation']
        );

        // Notify relevant users
        const toNotify = new Set();
        if (ticket.assigned_to && ticket.assigned_to !== req.user.userId) toNotify.add(ticket.assigned_to);
        if (ticket.created_by && ticket.created_by !== req.user.userId) toNotify.add(ticket.created_by);

        const messageType = isInternal ? 'internal note' : 'reply';
        const notifTitle = isInternal ? `📝 Internal Note on ${ticket.ticket_number}` : `💬 New Reply on ${ticket.ticket_number}`;
        const notifBody = `${req.user.name} added a ${messageType}: "${message_body.trim().slice(0, 80)}..."`;

        for (const userId of toNotify) {
            await createNotification(pool, {
                user_id: userId,
                type: 'new_message',
                title: notifTitle,
                body: notifBody,
                entity_id: ticket.id
            });
        }

        return res.status(201).json({
            success: true,
            message: isInternal ? "Internal note added." : "Message sent.",
            messageId
        });
    } catch (err) {
        console.error("addMessage:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
