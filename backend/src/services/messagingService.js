// src/services/messagingService.js
import { logger } from "../logger.js";
import connectDB from "../db/index.js";
import moment from 'moment-timezone';
import * as widgetAdapter from "../modules/conversations/adapters/widgetAdapter.js";
import * as emailAdapter from "../modules/conversations/adapters/emailAdapter.js";

/**
 * Standardizes inbound messages from any channel into the CRM.
 * @param {Object} payload { channel, senderId, senderName, body, attachments, metadata }
 */
export const handleInbound = async (payload) => {
    const { channel, senderId, senderName, body, attachments, metadata } = payload;
    const pool = connectDB();

    try {
        logger.info(`📨 Inbound message from [${channel}]: ${senderId}`);

        // 1. Identify or Create Customer
        let [customer] = await pool.query(
            `SELECT id FROM customers WHERE email = ? OR phone = ? OR customer_code = ?`,
            [senderId, senderId, senderId]
        );

        let customerId;
        if (!customer.length) {
            const [newCust] = await pool.query(
                `INSERT INTO customers (name, email, customer_code) VALUES (?, ?, ?)`,
                [senderName || 'Web Guest', senderId, `GUEST-${Date.now()}`]
            );
            customerId = newCust.insertId;
        } else {
            customerId = customer[0].id;
        }

        // 2. Find Active Ticket or Create New One
        const [existingTicket] = await pool.query(
            `SELECT t.id FROM tickets t 
             WHERE t.customer_id = ? AND t.status NOT IN ('resolved', 'closed') 
             AND t.source = ? ORDER BY t.created_at DESC LIMIT 1`,
            [customerId, channel]
        );

        let ticketId;
        if (!existingTicket.length) {
            // -- Enterprise SLA Enhancement --
            const { resolveSlaPolicy, generateTicketNumber, getSlaCalendar, resolveTicketTimezone } = await import("../modules/sla/slaPolicyService.js");
            const { SlaCalculator } = await import("./sla/calculator.js");
            
            // 1. Resolve Default Priority P3 (Medium)
            const [prioRows] = await pool.query(`SELECT id FROM priorities WHERE name = 'P3' LIMIT 1`);
            const priorityId = prioRows[0]?.id || 3; // Fallback to id 3
            
            // 2. Resolve SLA & ETR
            const resolvedTz = await resolveTicketTimezone(pool, { customerId });
            const slaPolicy = await resolveSlaPolicy(pool, { customerId, priorityId });
            const calendar = await getSlaCalendar(pool);
            const calendarForTicket = { ...calendar, timezone: resolvedTz || calendar?.timezone || 'Asia/Kolkata' };
            const calculator = new SlaCalculator(pool);
            const now = moment().tz(resolvedTz || 'Asia/Kolkata').format("YYYY-MM-DD HH:mm:ss");
            const etrMoment = calculator.computeDueDate(now, slaPolicy.resolution_hrs, calendarForTicket);
            const etr = etrMoment.format("YYYY-MM-DD HH:mm:ss");

            // 3. Dynamic Numbering
            const ticketNumber = await generateTicketNumber(pool, priorityId);

            // Get default project
            const [project] = await pool.query("SELECT id FROM projects LIMIT 1");
            const projectId = project[0]?.id || 1;

            const [newTicket] = await pool.query(
                `INSERT INTO tickets (
                    ticket_number, customer_id, project_id, category, priority, priority_id, description, source, etr, 
                    str, created_by, sla_policy_id, sla_version, resolved_timezone
                ) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
                [
                    ticketNumber, customerId, projectId, 'Inquiry', 'P3', priorityId, body.substring(0, 500), channel, etr, 
                    now, slaPolicy.id, slaPolicy.version, resolvedTz
                ]
            );
            ticketId = newTicket.insertId;

            // log activity
            await pool.query(
                `INSERT INTO ticket_activities (ticket_id, action, note) VALUES (?, 'created', ?)`,
                [ticketId, `Ticket auto-created from [${channel}] channel`]
            );
        } else {
            ticketId = existingTicket[0].id;
        }

        // 3. Find or Create Conversation record
        const [conversations] = await pool.query(
            "SELECT id FROM conversations WHERE ticket_id = ? LIMIT 1",
            [ticketId]
        );

        let conversationId;
        if (!conversations.length) {
            const [newConv] = await pool.query(
                "INSERT INTO conversations (ticket_id, source_channel, participant_identity) VALUES (?, ?, ?)",
                [ticketId, channel, senderId]
            );
            conversationId = newConv.insertId;
        } else {
            conversationId = conversations[0].id;
        }

        // 4. Add Message to Conversation Messages
        await pool.query(
            `INSERT INTO conversation_messages (conversation_id, sender_id, sender_name, sender_type, message_body, created_at) 
             VALUES (?, ?, ?, 'customer', ?, NOW())`,
            [conversationId, customerId, senderName || 'Guest User', body]
        );

        return { success: true, ticketId };
    } catch (err) {
        logger.error("❌ messagingService inbound error:", err.message);
        throw err;
    }
};

/**
 * Routes outbound replies from agents to the correct channel adapter.
 */
export const handleOutbound = async (conversationId, messageData) => {
    const pool = connectDB();
    try {
        const [conv] = await pool.query(
            `SELECT t.source, t.id as ticket_id
             FROM conversations c 
             JOIN tickets t ON c.ticket_id = t.id 
             WHERE c.id = ?`,
            [conversationId]
        );

        if (!conv.length) throw new Error("Conversation not found");

        const source = conv[0].source;
        logger.info(`📤 Outbound reply to [${source}] for ticket ${conv[0].ticket_id}`);

        // Route to specific adapter
        switch (source) {
            case 'chat':
                // For chat, we need the guest's ID which we stored in metadata during inbound
                // Or we can find it from the customer table linked to the ticket
                const [cust] = await pool.query(
                    "SELECT c.email as guest_id FROM tickets t JOIN customers c ON t.customer_id = c.id WHERE t.id = ?",
                    [conv[0].ticket_id]
                );
                if (cust.length) {
                    await widgetAdapter.send(cust[0].guest_id, messageData);
                }
                break;
            case 'email':
                // For email, prefer the actual thread starter stored on the conversation.
                const [emailRecipientRows] = await pool.query(
                    `SELECT email FROM conversation_participants
                     WHERE conversation_id = ? AND type = 'to'
                     ORDER BY id ASC LIMIT 1`,
                    [conversationId]
                );
                const [emailCust] = await pool.query(
                    "SELECT c.email FROM tickets t JOIN customers c ON t.customer_id = c.id WHERE t.id = ?",
                    [conv[0].ticket_id]
                );
                const emailRecipient = emailRecipientRows[0]?.email || emailCust[0]?.email || null;
                if (emailRecipient) {
                    await emailAdapter.send(emailRecipient, {
                        message: messageData.message,
                        ticketId: conv[0].ticket_id,
                        senderId: messageData.senderId,
                        messageId: messageData.messageId
                    });
                } else {
                    logger.warn(`[MessagingService] No email recipient found for conversation=${conversationId} ticket=${conv[0].ticket_id}`);
                }
                break;
            default:
                logger.warn(`No adapter found for channel: ${source}`);
        }
    } catch (err) {
        logger.error("❌ messagingService outbound error:", err.message);
        throw err;
    }
};
