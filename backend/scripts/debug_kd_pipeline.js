// scripts/debug_kd_pipeline.js
import connectDB from "../src/db/index.js";
import { processEnterpriseWorkflow } from "../src/modules/workflows/workflowEngine.js";
import { logger } from "../src/logger.js";

async function runTest() {
    const pool = connectDB();
    const conn = await pool.getConnection();

    try {
        const [userRows] = await conn.query("SELECT id FROM users WHERE email = ? LIMIT 1", [process.env.GMAIL_USER]);
        const userId = userRows[0]?.id || 6; 
        const queueId = 10; // Domain Queue (aligned with production)
        
        console.log("\n--- Starting End-to-End Pipeline Test ---");

        // 1. Force the user to be ONLINE (Manual)
        console.log("STEP 1: Forcing user ID 6 to ONLINE (Manual mode)...");
        await conn.query(
            "UPDATE users SET is_online = 1, status = 'available', status_source = 'manual', last_heartbeat = NOW() WHERE id = ?",
            [userId]
        );

        // 2. Create a Dummy Ticket that needs assignment
        console.log("STEP 2: Creating a dummy ticket for 'Domain Queue'...");
        const [ticketResult] = await conn.query(
            `INSERT INTO tickets (ticket_number, customer_id, project_id, queue_id, priority, status, source, category, assignment_source, subject, description, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ['DEBUG-KD-' + Date.now().toString().slice(-4), 1, 1, queueId, 'P3', 'open', 'email', 'Technical Support', 'auto', 'End-to-End Pipeline Verification', 'Testing full pipeline assignment for User ID 6.', 1]
        );
        const ticketId = ticketResult.insertId;

        // 3. Manually trigger the Enterprise Pipeline
        console.log(`STEP 3: Triggering Assignment Engine for Ticket #${ticketId}...`);
        // We simulate the workflow completion which triggers assignment
        await processEnterpriseWorkflow('ticket_created', { ticketId: ticketId });

        // 4. Verify results
        console.log("STEP 4: Verifying final assignment...");
        const [finalTicket] = await conn.query(
            "SELECT t.id, t.assigned_to, u.name as assignee_name FROM tickets t LEFT JOIN users u ON t.assigned_to = u.id WHERE t.id = ?",
            [ticketId]
        );

        if (finalTicket[0].assigned_to === userId) {
            console.log("\n✅ SUCCESS: Ticket was correctly assigned to " + finalTicket[0].assignee_name);
        } else {
            console.log("\n❌ FAILED: Ticket was assigned to " + (finalTicket[0].assignee_name || "NOBODY"));
            console.log("Note: Assignment depends on lead balancing. If others are also online and have 0 tickets, they might get picked first.");
        }

    } catch (err) {
        console.error("DEBUG ERROR:", err);
    } finally {
        conn.release();
        process.exit();
    }
}

runTest();
