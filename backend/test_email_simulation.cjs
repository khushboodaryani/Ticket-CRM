// test_email_simulation.cjs
const mysql = require('mysql2/promise');
require('dotenv').config();

const testEmail = {
    from: "Devashish Sarkar <Devashish@ocube.oo>",
    to: "Support <support@multycomm.com>",
    cc: "Lavish <lavish@ocube.oo>, Akanksha <akankshabisht@ocubeservices.com>",
    subject: "FW: Login Hours Discrepency",
    text: "Dear Team, I would like to bring to your attention..."
};

async function simulate() {
    const pool = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'Ayan@1012',
        database: process.env.DB_NAME || 'ticket_crm'
    });

    console.log("🚀 Simulating Email Intake...");

    // 1. Normalize
    const senderEmail = "devashish@ocube.oo";
    const senderName = "Devashish Sarkar";
    const cleanSubject = "Login Hours Discrepency";

    try {
        // 2. Customer Lookup
        console.log("Step 1: Customer Lookup...");
        let [customers] = await pool.query('SELECT id FROM customers WHERE email = ? LIMIT 1', [senderEmail]);
        let customerId;
        if (customers.length) {
            customerId = customers[0].id;
            console.log(`- Found customer ID: ${customerId}`);
        } else {
            const [ins] = await pool.query('INSERT INTO customers (name, email) VALUES (?, ?)', [senderName, senderEmail]);
            customerId = ins.insertId;
            console.log(`- Created customer ID: ${customerId}`);
        }

        // 3. Ticket Creation
        console.log("Step 2: Ticket Creation...");
        const ticketNumber = `TKT-TEST-${Date.now()}`;
        const query = `INSERT INTO tickets (ticket_number, customer_id, project_id, category, priority, description, status, escalation_level, sla_state, str, etr, created_by, assigned_to, source)
                       VALUES (?,?,?,?,?,?, 'open', 1, 'active', NOW(), NOW(), ?, ?, 'email')`;
        const params = [ticketNumber, customerId, 1, cleanSubject, 'P3', testEmail.text, 5, null]; // systemUserId=5, finalAssigneeId=null
        
        const [res] = await pool.query(query, params);
        console.log(`✅ Ticket Created ID: ${res.insertId} (Number: ${ticketNumber})`);

        // 4. Conversation
        console.log("Step 3: Conversation Creation...");
        const [cv] = await pool.query('INSERT INTO conversations (ticket_id, source_channel, participant_identity, cc_emails) VALUES (?,?,?,?)', 
            [res.insertId, 'email', senderEmail, "lavish@ocube.oo,akankshabisht@ocubeservices.com"]);
        console.log(`✅ Conversation Created ID: ${cv.insertId}`);

        console.log("\n✨ Simulation Successful. No DB errors for this payload.");
        
        // Cleanup
        await pool.query('DELETE FROM conversation_messages WHERE conversation_id = ?', [cv.insertId]);
        await pool.query('DELETE FROM conversations WHERE id = ?', [cv.insertId]);
        await pool.query('DELETE FROM tickets WHERE id = ?', [res.insertId]);
        // Keep customer for future tests? No, cleanup.
        // await pool.query('DELETE FROM customers WHERE id = ?', [customerId]);

    } catch (err) {
        console.error("❌ Simulation Failed:", err.message);
    } finally {
        await pool.end();
    }
}

simulate();
