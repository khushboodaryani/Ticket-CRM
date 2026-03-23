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
            // Auto-calculate ETR (default 4 hours)
            const etr = new Date();
            etr.setHours(etr.getHours() + 4);

            const ticketNumber = `TKT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

            // Get default project
            const [project] = await pool.query("SELECT id FROM projects LIMIT 1");
            const projectId = project[0]?.id || 1;

            const [newTicket] = await pool.query(
                `INSERT INTO tickets (ticket_number, customer_id, project_id, category, description, source, etr, created_by) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                [ticketNumber, customerId, projectId, 'Inquiry', body.substring(0, 100), channel, etr]
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

        // 3. Add Message to Conversations
        await pool.query(
            `INSERT INTO conversations (ticket_id, sender_type, message, metadata) VALUES (?, 'customer', ?, ?)`,
            [ticketId, body, JSON.stringify(metadata)]
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
                // For email, send reply to customer's email address
                const [emailCust] = await pool.query(
                    "SELECT c.email FROM tickets t JOIN customers c ON t.customer_id = c.id WHERE t.id = ?",
                    [conv[0].ticket_id]
                );
                if (emailCust.length && emailCust[0].email) {
                    await emailAdapter.send(emailCust[0].email, {
                        message: messageData.message,
                        ticketId: conv[0].ticket_id
                    });
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
