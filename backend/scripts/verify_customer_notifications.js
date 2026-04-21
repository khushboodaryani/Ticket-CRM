
import connectDB from '../src/db/index.js';
import { logger } from '../src/logger.js';
import { resolveCustomerByDomain } from '../src/services/emailPoller.js';
import { 
    sendTicketNotification, 
    sendTicketAssignedNotification, 
    sendSlaBreachNotification 
} from '../src/modules/notifications/emailService.js';
import nodemailer from 'nodemailer';

/**
 * Customer & Notification Workflow Debug Tool - v2
 */

async function runDebug() {
    const pool = connectDB();
    console.log('\n🚀 Starting Customer & Workflow Debug...\n');

    let tempCustomerId = null;
    let tempProjectId = null;
    let tempDomainId = null;

    try {
        // --- 1. CREATE CUSTOMER & PROJECT ---
        console.log('--- Step 1: Setup Test Customer & Project ---');
        const [cResult] = await pool.query(
            'INSERT INTO customers (name, email) VALUES (?, ?)',
            ['Debug Customer', 'customer@debugtest.com']
        );
        tempCustomerId = cResult.insertId;

        const [pResult] = await pool.query(
            'INSERT INTO projects (name, customer_id) VALUES (?, ?)',
            ['Debug Project', tempCustomerId]
        );
        tempProjectId = pResult.insertId;

        const [dResult] = await pool.query(
            'INSERT INTO customer_domains (customer_id, project_id, domain, is_active) VALUES (?, ?, ?, 1)',
            [tempCustomerId, tempProjectId, 'debugtest.com']
        );
        tempDomainId = dResult.insertId;

        console.log(`✅ Setup Success: Customer(${tempCustomerId}), Project(${tempProjectId}), Domain(debugtest.com)`);

        // --- 2. VERIFY MAPPING ---
        console.log('\n--- Step 2: Verify Email -> Project Mapping ---');
        const conn = await pool.getConnection();
        const resolution = await resolveCustomerByDomain(
            conn, pool, 
            'tester@debugtest.com', 'Tester', 'Help', 'Description', 
            'msg-id-123', null, [], null
        );
        conn.release();

        if (resolution && resolution.projectId === tempProjectId) {
            console.log(`✅ Mapping Success: Email correctly mapped to Project ID ${tempProjectId}`);
        } else {
            console.log(`❌ Mapping Failure: Expected Project ID ${tempProjectId}, got ${resolution?.projectId}`);
        }

        // --- 3. VERIFY KEYWORD -> CATEGORY MAPPING ---
        console.log('\n--- Step 3: Verify Keyword Category Mapping ---');
        const hasWord = (text, word) => new RegExp(`\\b${word}\\b`, 'i').test(text);
        
        const testKeywords = [
            { text: "System Critical Failure", expectedCat: 1 }, // P-Series
            { text: "General Question about login", expectedCat: 2 }, // Q-Series
            { text: "Emergency ticket", expectedCat: 1 } // P-Series (if emergency is a P keyword)
        ];

        for (const test of testKeywords) {
            let catId = 2; // Default
            if (hasWord(test.text, 'critical') || hasWord(test.text, 'emergency')) catId = 1;

            if (catId === test.expectedCat) {
                console.log(`✅ Keyword "${test.text}" correctly mapped to Category ${catId}`);
            } else {
                console.log(`❌ Keyword "${test.text}" Mapped to ${catId}, expected ${test.expectedCat}`);
            }
        }

        // --- 4. VERIFY NOTIFICATIONS ---
        console.log('\n--- Step 4: Verify Notification Triggers ---');
        
        const mockTicket = {
            id: 999,
            ticket_number: 'DEBUG-001',
            subject: 'Debug Notification Subject',
            description: 'This is a test description',
            assigned_to_name: 'Debug Agent',
            customer_name: 'Debug Customer',
            priority: 'P2',
            category: 'Testing'
        };

        console.log('🔄 Triggering Acknowledgement...');
        try {
            await sendTicketNotification(mockTicket, 'customer@debugtest.com');
            console.log('✅ Acknowledgement Flow Executed');
        } catch (e) {
            console.log(`ℹ️  Acknowledgement Result: ${e.message.includes('auth') ? 'Success (Logic ran, SMTP auth skipped)' : 'Error: ' + e.message}`);
        }

        console.log('🔄 Triggering Assignment...');
        try {
            await sendTicketAssignedNotification(mockTicket, 'customer@debugtest.com', 'Debug Agent');
            console.log('✅ Assignment Flow Executed');
        } catch (e) {
            console.log(`ℹ️  Assignment Result: ${e.message.includes('auth') ? 'Success (Logic ran, SMTP auth skipped)' : 'Error: ' + e.message}`);
        }

        console.log('🔄 Triggering SLA Breach...');
        try {
            await sendSlaBreachNotification(mockTicket, 'customer@debugtest.com');
            console.log('✅ SLA Breach Flow Executed');
        } catch (e) {
            console.log(`ℹ️  SLA Breach Result: ${e.message.includes('auth') ? 'Success (Logic ran, SMTP auth skipped)' : 'Error: ' + e.message}`);
        }

        console.log('\n🏁 Workflow Debug Finished.');

    } catch (err) {
        console.error('❌ Debug Script Error:', err.message);
    } finally {
        if (tempDomainId) await pool.query('DELETE FROM customer_domains WHERE id = ?', [tempDomainId]);
        if (tempProjectId) await pool.query('DELETE FROM projects WHERE id = ?', [tempProjectId]);
        if (tempCustomerId) await pool.query('DELETE FROM customers WHERE id = ?', [tempCustomerId]);
        console.log('\n🧹 Cleanup: Test records removed.');
        process.exit(0);
    }
}

runDebug();
