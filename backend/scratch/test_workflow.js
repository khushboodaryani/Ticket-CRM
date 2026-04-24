
import connectDB from '../src/db/index.js';
import { processEnterpriseWorkflow } from '../src/modules/workflows/workflowEngine.js';
import { logger } from '../src/logger.js';

async function debugWorkflow() {
    const pool = connectDB();
    const ticketId = 146; // Using an existing ticket ID from local DB
    
    console.log(`\n--- [DEBUG] Starting Workflow Test for Ticket #${ticketId} ---\n`);

    const data = {
        ticketId,
        payload: {
            priority: 'R2',
            source: 'email',
            sender_email: 'khushboo@multycomm.com'
        }
    };

    try {
        // We run the actual workflow function
        // Note: The function internally handles its own transaction, 
        // so we can't easily roll it back from here if it commits.
        // HOWEVER, we are testing the logic flow.
        
        await processEnterpriseWorkflow('ticket_created', data);
        
        console.log(`\n--- [DEBUG] Workflow processed successfully. Check logs above. ---\n`);
    } catch (err) {
        console.error(`\n--- [DEBUG] Workflow FAILED: ${err.message} ---\n`);
        console.error(err);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

debugWorkflow();
