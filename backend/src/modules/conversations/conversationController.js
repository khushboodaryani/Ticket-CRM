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

async function getAllOrCreateConversations(pool, ticketId, sourceChannel = 'manual') {
    const [existing] = await pool.query(
        `SELECT * FROM conversations WHERE ticket_id=? ORDER BY id ASC`,
        [ticketId]
    );
    if (existing.length) return existing;
    const created = await getOrCreateConversation(pool, ticketId, sourceChannel);
    return [created];
}

async function getPreferredConversation(pool, ticketId, preferredChannel = 'manual') {
    const [rows] = await pool.query(
        `SELECT *
         FROM conversations
         WHERE ticket_id=?
         ORDER BY CASE WHEN source_channel = ? THEN 0 ELSE 1 END, id ASC
         LIMIT 1`,
        [ticketId, preferredChannel]
    );
    if (rows.length) return rows[0];
    return getOrCreateConversation(pool, ticketId, preferredChannel);
}

// GET /api/tickets/:ticketId/conversation
export const getConversation = async (req, res) => {
    try {
        const pool = connectDB();
        const ticketId = req.params.ticketId;

        // Ensure ticket exists
        const [ticketRows] = await pool.query(`SELECT id FROM tickets WHERE id=?`, [ticketId]);
        if (!ticketRows.length) return res.status(404).json({ success: false, message: "Ticket not found." });

        const [ticketInfo] = await pool.query(`SELECT source FROM tickets WHERE id=? LIMIT 1`, [ticketId]);
        const ticketSource = ticketInfo[0]?.source || 'manual';
        const conversations = await getAllOrCreateConversations(pool, ticketId, ticketSource);
        const conversationIds = conversations.map(c => c.id);

        const [messages] = await pool.query(
            `SELECT 
                cm.*, 
                CASE 
                    WHEN cm.sender_type = 'agent' THEN u.name
                    ELSE cm.sender_name 
                END as sender_name,
                u.role as sender_role
             FROM conversation_messages cm
             LEFT JOIN users u ON cm.sender_type = 'agent' AND cm.sender_id = u.id
             WHERE cm.conversation_id IN (?)
             ORDER BY cm.created_at ASC`,
            [conversationIds]
        );

        // Fetch attachments for these messages
        if (messages.length > 0) {
            const msgIds = messages.map(m => m.id);
            const [attRows] = await pool.query(
                `SELECT id, message_id, original_name, file_type, file_size, visibility
                 FROM conversation_message_attachments
                 WHERE message_id IN (?) AND is_deleted = 0`,
                [msgIds]
            );

            // Group by message_id
            const attMap = attRows.reduce((acc, a) => {
                if (!acc[a.message_id]) acc[a.message_id] = [];
                acc[a.message_id].push(a);
                return acc;
            }, {});

            messages.forEach(m => {
                m.attachments = attMap[m.id] || [];
            });
        }

        return res.json({
            success: true,
            conversation: conversations[0],
            conversations,
            messages
        });
    } catch (err) {
        console.error("getConversation:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/tickets/:ticketId/conversation/messages
export const addMessage = async (req, res) => {
    const { message_body, is_internal_note } = req.body;
    const body = message_body?.trim() || "";
    const hasFiles = req.files && req.files.length > 0;

    if (!body && !hasFiles) {
        return res.status(400).json({ success: false, message: "message_body is required." });
    }

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

        // --- ENTERPRISE SLA 2.1: First Response Guard ---
        const isInternal = (is_internal_note === '1' || is_internal_note === 1 || is_internal_note === true) ? 1 : 0;
        
        if (!isInternal && !ticket.is_first_response_met) {
            await pool.query(
                `UPDATE tickets SET is_first_response_met = 1 WHERE id = ?`,
                [ticketId]
            );
            
            await pool.query(
                `INSERT INTO sla_event_logs (ticket_id, event_type, note) 
                 VALUES (?, 'first_response', 'First response SLA met by agent reply')`,
                [ticketId]
            );
            logger.info(`[SLA] First response met for Ticket #${ticket.ticket_number}`);
        }

        const preferredChannel = ticket.source || 'manual';
        const conversation = await getPreferredConversation(pool, ticketId, preferredChannel);

        const [msgResult] = await pool.query(
            `INSERT INTO conversation_messages
             (conversation_id, sender_id, sender_type, sender_name, message_body, is_internal_note, is_sent)
             VALUES (?,?,?,?,?,?,?)`,
            [conversation.id, req.user.userId, 'agent', req.user.name, body, isInternal, 0]
        );

        const messageId = msgResult.insertId;

        // Broadcast real-time message event (Internal CRM Frontend)
        const broadcastData = {
            id: messageId,
            conversation_id: conversation.id,
            ticket_id: ticketId,
            sender_id: req.user.userId,
            sender_name: req.user.name,
            sender_type: 'agent',
            sender_role: req.user.role,
            message_body: body,
            is_internal_note: isInternal,
            created_at: new Date(),
            attachments: [] // Will populate if files uploaded
        };

        // Handle File Uploads
        if (req.files && req.files.length > 0) {
            const visibility = isInternal ? 'internal' : 'public';
            const attParams = [];
            for (const file of req.files) {
                attParams.push([
                    messageId,
                    1, // Default tenant_id
                    file.originalname,
                    file.filename,
                    file.mimetype,
                    file.size,
                    req.user.userId,
                    visibility
                ]);
            }

            const [attResult] = await pool.query(
                `INSERT INTO conversation_message_attachments 
                 (message_id, tenant_id, original_name, storage_path, file_type, file_size, uploaded_by, visibility)
                 VALUES ?`,
                [attParams]
            );

            // Fetch created attachments to include in broadcast/response
            const [newAtts] = await pool.query(
                `SELECT id, original_name, file_type, file_size, visibility FROM conversation_message_attachments WHERE message_id = ?`,
                [messageId]
            );
            broadcastData.attachments = newAtts;
        }

        broadcast("new_message", broadcastData);

        // Trigger Outbound Channel Adapter if not internal
        if (!isInternal) {
            import("../../services/messagingService.js").then(m => {
                m.handleOutbound(conversation.id, { 
                    message: body,
                    senderId: req.user.userId,
                    messageId: messageId
                });
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
        const notifBody = `${req.user.name} added a ${messageType}: "${body.slice(0, 80)}..."`;

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
