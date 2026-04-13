
import dotenv from 'dotenv';
import connectDB from '../src/db/index.js';
import moment from 'moment-timezone';

dotenv.config();
const TZ = process.env.TIMEZONE || 'Asia/Kolkata';

/**
 * PRODUCTION REALITY CHECK
 * This script simulates the processing of a new email using the exact SQL logic from emailPoller.js
 */
async function productionRealityCheck() {
    const pool = connectDB();
    const conn = await pool.getConnection();

    try {
        console.log("🚦 Starting Production Reality Check...");
        await conn.beginTransaction();

        // 1. Mock Data
        const messageId = `PROD-TEST-${Date.now()}@google.com`;
        const senderEmail = "customer@example.com";
        const senderName = "Satisfied Customer";
        const rawSubject = "Urgent: Server Down!";
        const cleanSubject = "Urgent: Server Down!";
        const bodyText = "Help! My server is down since 10 AM.";
        const description = bodyText;
        const participantList = ["manager@example.com", "billing@example.com"];
        const defaultProjectId = 1;
        const systemUserId = 5;

        // 2. Email Logs (Idempotency check)
        console.log("-> Step 1: Log Email...");
        const [logRes] = await conn.query(
            `INSERT INTO email_logs (message_id, sender_email, subject, status) VALUES (?, ?, ?, 'retry_pending')`,
            [messageId, senderEmail, rawSubject.slice(0, 500)]
        );
        const logId = logRes.insertId;

        // 3. Customer Lookup/Create
        console.log("-> Step 2: Customer Handle...");
        let [customers] = await conn.query('SELECT id FROM customers WHERE email = ? LIMIT 1', [senderEmail]);
        let customerId;
        if (customers.length) {
            customerId = customers[0].id;
        } else {
            const [cRes] = await conn.query('INSERT INTO customers (name, email) VALUES (?, ?)', [senderName, senderEmail]);
            customerId = cRes.insertId;
        }

        // 4. Ticket Number Generation
        console.log("-> Step 3: Ticket Number...");
        const today = moment().tz(TZ).format('YYYYMMDD');
        const [countRow] = await conn.query(`SELECT COUNT(*) as cnt FROM tickets WHERE DATE(created_at) = CURDATE()`);
        const seq = String(countRow[0].cnt + 1).padStart(4, '0');
        const ticketNumber = `TKT-${today}-${seq}`;

        // 5. Priority & SLA
        let finalPriority = 'P3';
        if (rawSubject.toLowerCase().includes('server down')) finalPriority = 'P1';
        const [policies] = await conn.query('SELECT resolution_time_hours FROM sla_policies WHERE priority = ?', [finalPriority]);
        const etr = moment().tz(TZ).add(policies[0]?.resolution_time_hours || 2, 'hours').format('YYYY-MM-DD HH:mm:ss');
        const nowStr = moment().tz(TZ).format('YYYY-MM-DD HH:mm:ss');

        // 6. Insert Ticket
        console.log("-> Step 4: Insert Ticket...");
        const [tResult] = await conn.query(
            `INSERT INTO tickets (ticket_number, subject, customer_id, project_id, category, priority, description, status, escalation_level, sla_state, str, etr, created_by, assigned_to, source)
             VALUES (?,?,?,?,?,?,?, 'open', 1, 'active', ?, ?, ?, ?, 'email')`,
            [ticketNumber, rawSubject.slice(0, 500), customerId, defaultProjectId, cleanSubject.slice(0, 250), finalPriority, description, nowStr, etr, systemUserId, null]
        );
        const ticketId = tResult.insertId;

        // 7. Insert Conversation
        console.log("-> Step 5: Insert Conversation...");
        const [cvResult] = await conn.query(
            `INSERT INTO conversations (ticket_id, source_channel, root_message_id, customer_id) VALUES (?,?,?,?)`,
            [ticketId, 'email', messageId, customerId]
        );
        const conversationId = cvResult.insertId;

        // 8. Insert Message
        console.log("-> Step 6: Insert Message...");
        await conn.query(
            `INSERT INTO conversation_messages (conversation_id, sender_type, sender_name, message_body, message_id, reference_chain)
             VALUES (?, 'customer', ?, ?, ?, ?)`,
            [conversationId, senderName, bodyText, messageId, '']
        );

        // 9. Participants
        console.log("-> Step 7: Participants...");
        await conn.query(`INSERT INTO conversation_participants (conversation_id, email, type) VALUES (?, ?, 'to')`, [conversationId, senderEmail]);
        for (const email of participantList) {
            await conn.query(`INSERT IGNORE INTO conversation_participants (conversation_id, email, type) VALUES (?, ?, 'cc')`, [conversationId, email]);
        }

        // 10. Activity
        await conn.query('INSERT INTO ticket_activities (ticket_id, action, note) VALUES (?, "created", ?)', [ticketId, `Auto-created from email: ${senderEmail}`]);

        // 11. Final Status Update
        await conn.query(`UPDATE email_logs SET status='processed' WHERE id=?`, [logId]);

        console.log("✅ All SQL steps successful!");
        await conn.rollback();
        console.log("🌈 Transaction rolled back successfully. Dry run complete.");
        process.exit(0);
    } catch (err) {
        console.error("❌ REALITY CHECK FAILED:", err.message);
        if (conn) await conn.rollback();
        process.exit(1);
    } finally {
        if (conn) conn.release();
    }
}

productionRealityCheck();
