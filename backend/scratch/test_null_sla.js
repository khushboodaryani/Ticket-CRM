
import connectDB from '../src/db/index.js';
import { processEnterpriseWorkflow } from '../src/modules/workflows/workflowEngine.js';
import { logger } from '../src/logger.js';

async function testNullSla() {
    const pool = connectDB();
    const ticketId = 146; 
    
    // Reset ticket to allow processing
    await pool.query("UPDATE tickets SET workflow_processed = 0 WHERE id = ?", [ticketId]);

    console.log(`\n--- [DEBUG] Testing NULL SLA Policy for Ticket #${ticketId} ---\n`);

    const data = {
        ticketId,
        payload: {
            priority: 'NA', // This will fail to find an SLA policy
            source: 'email',
            sender_email: 'khushboo@multycomm.com'
        }
    };

    try {
        await processEnterpriseWorkflow('ticket_created', data);
        console.log(`\n--- [DEBUG] Pipeline completed safely (no crash) even with missing SLA policy. ---\n`);
    } catch (err) {
        console.error(`\n--- [DEBUG] Pipeline CRASHED: ${err.message} ---\n`);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

testNullSla();
