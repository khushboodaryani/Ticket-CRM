
import dotenv from 'dotenv';
import connectDB from '../src/db/index.js';
import moment from 'moment-timezone';

dotenv.config();
const TZ = process.env.TIMEZONE || 'Asia/Kolkata';

async function testTicketCreation() {
    const pool = connectDB();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        
        const ticketNumber = `TEST-${moment().tz(TZ).format('YYYYMMDD')}-0001`;
        const rawSubject = "Test Email Subject";
        const cleanSubject = "Test Email Subject";
        const description = "This is a test description.";
        const customerId = 1; // Assuming customer 1 exists or I should create one
        const defaultProjectId = 1;
        const finalPriority = 'P3';
        const nowStr = moment().tz(TZ).format('YYYY-MM-DD HH:mm:ss');
        const etr = moment().tz(TZ).add(2, 'hours').format('YYYY-MM-DD HH:mm:ss');
        const systemUserId = 5;
        const finalAssigneeId = null;

        console.log("Attempting to insert test ticket...");
        const [tResult] = await conn.query(
            `INSERT INTO tickets (ticket_number, subject, customer_id, project_id, category, priority, description, status, escalation_level, sla_state, str, etr, created_by, assigned_to, source)
             VALUES (?,?,?,?,?,?,?, 'open', 1, 'active', ?, ?, ?, ?, 'email')`,
            [ticketNumber, rawSubject.slice(0, 500), customerId, defaultProjectId, cleanSubject.slice(0, 250), finalPriority, description, nowStr, etr, systemUserId, finalAssigneeId]
        );
        
        console.log("✅ Ticket inserted, ID:", tResult.insertId);
        
        // Test conversation creation
        const [cvResult] = await conn.query(
            `INSERT INTO conversations (ticket_id, source_channel, root_message_id, customer_id) VALUES (?,?,?,?)`,
            [tResult.insertId, 'email', 'test-msg-id-123', customerId]
        );
        console.log("✅ Conversation created, ID:", cvResult.insertId);

        await conn.rollback(); // Don't actually pollute the DB
        console.log("✅ Transaction rolled back successfully (Test complete).");
        process.exit(0);
    } catch (err) {
        console.error('❌ Ticket creation failed:', err.message);
        if (conn) await conn.rollback();
        process.exit(1);
    } finally {
        if (conn) conn.release();
    }
}

testTicketCreation();
