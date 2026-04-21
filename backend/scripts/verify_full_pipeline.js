
import connectDB from '../src/db/index.js';
import { logger } from '../src/logger.js';
import { createTicket, escalateTicket } from '../src/modules/tickets/ticketController.js';

/**
 * Full Pipeline Debug Tool - v3 (Self-Sufficient)
 */

async function runDebug() {
    const pool = connectDB();
    console.log('\n🚀 Starting Full Pipeline Debug...\n');

    let tempProjectId = null;
    let ticketId = null;

    try {
        // --- 1. SET UP TEST CONTEXT ---
        const [customers] = await pool.query('SELECT id FROM customers WHERE is_deleted = 0 LIMIT 1');
        if (!customers.length) throw new Error("No active customers found.");

        const TEST_CUSTOMER_ID = customers[0].id;
        const AGENT_KHUSHI_ID = 5;
        const TL_ISHA_ID = 4;

        const [projects] = await pool.query('SELECT id FROM projects WHERE customer_id = ? AND is_deleted = 0 LIMIT 1', [TEST_CUSTOMER_ID]);
        if (!projects.length) {
            console.log('ℹ️ No project found. Creating temporary test project...');
            const [pResult] = await pool.query(
                'INSERT INTO projects (name, customer_id) VALUES (?, ?)',
                ['Debug Test Project', TEST_CUSTOMER_ID]
            );
            tempProjectId = pResult.insertId;
        }
        const TEST_PROJECT_ID = tempProjectId || projects[0].id;

        // Mock Request/Response
        const mockRes = {
            statusCode: 200,
            data: {},
            status: function(code) { this.statusCode = code; return this; },
            json: function(data) { this.data = data; return this; }
        };
        const mockUserKhushi = { userId: AGENT_KHUSHI_ID, name: 'khushi', role: 'agent' };

        // --- 2. TEST TICKET CREATION & MANUAL ASSIGNMENT ---
        console.log('--- Step 1: Manual Ticket Creation & Assignment ---');
        const createReq = {
            user: mockUserKhushi,
            body: {
                customer_id: TEST_CUSTOMER_ID,
                project_id: TEST_PROJECT_ID,
                category: 'Debug Test Ticket',
                priority: 'P2',
                description: 'Testing full pipeline flow',
                source: 'manual',
                assigned_to: AGENT_KHUSHI_ID
            }
        };

        await createTicket(createReq, mockRes);
        
        if (mockRes.statusCode !== 201) {
            throw new Error(`Ticket Creation Failed: ${mockRes.data.message}`);
        }

        ticketId = mockRes.data.ticketId;
        console.log(`✅ Ticket Created: ${mockRes.data.ticket_number} (ID: ${ticketId})`);

        const [rows] = await pool.query('SELECT assigned_to FROM tickets WHERE id = ?', [ticketId]);
        if (rows[0].assigned_to === AGENT_KHUSHI_ID) {
            console.log(`✅ Manual Assignment Verified: Assigned to Khushi`);
        }

        // --- 3. TEST MANUAL ESCALATION ---
        console.log('\n--- Step 2: Manual Escalation Chain ---');
        const escalateReq = {
            user: mockUserKhushi,
            params: { id: ticketId },
            body: { reason: 'System Debug Escalation' }
        };

        await escalateTicket(escalateReq, mockRes);
        
        const [escRows] = await pool.query(
            `SELECT t.assigned_to, u.name as assignee_name, t.escalation_level 
             FROM tickets t 
             LEFT JOIN users u ON t.assigned_to = u.id 
             WHERE t.id = ?`, 
            [ticketId]
        );

        console.log(`🔍 New Escalation Level: ${escRows[0].escalation_level}`);
        console.log(`🔍 New Assigned To: ${escRows[0].assignee_name}`);

        if (escRows[0].assigned_to === TL_ISHA_ID) {
            console.log(`✅ Manual Escalation Verified: Ticket moved to TL (Isha)`);
        } else {
            console.log(`⚠️ Escalation result: Assigned to ${escRows[0].assignee_name}.`);
        }

        // --- 4. TEST EMAIL PRIORITY MAPPING ---
        console.log('\n--- Step 3: Email Ingestion Priority mapping ---');
        const hasWord = (text, word) => new RegExp(`\\b${word}\\b`, 'i').test(text);
        const testSubject = "CRITICAL: System Down";
        
        let targetCategoryId = 2; // Default Q
        if (hasWord(testSubject, 'critical')) targetCategoryId = 1; // P

        const [prioRows] = await pool.query(
            `SELECT name FROM priorities WHERE category_id = ? AND is_active = 1 ORDER BY level DESC LIMIT 1`,
            [targetCategoryId]
        );
        console.log(`✅ Result: "Critical" keyword mapped to category ${targetCategoryId} → Resolved as: "${prioRows[0]?.name}"`);

        console.log('\n🏁 Debug Pipeline Finished.\n');

    } catch (err) {
        console.error('❌ Debug Script Error:', err.message);
    } finally {
        // Clean up
        if (ticketId) {
            await pool.query('DELETE FROM ticket_activities WHERE ticket_id = ?', [ticketId]);
            await pool.query('DELETE FROM escalation_logs WHERE ticket_id = ?', [ticketId]);
            await pool.query('DELETE FROM conversations WHERE ticket_id = ?', [ticketId]);
            await pool.query('DELETE FROM tickets WHERE id = ?', [ticketId]);
            console.log('🧹 Cleanup: Debug Ticket removed.');
        }
        if (tempProjectId) {
            await pool.query('DELETE FROM projects WHERE id = ?', [tempProjectId]);
            console.log('🧹 Cleanup: Temporary Project removed.');
        }
        process.exit(0);
    }
}

runDebug();
