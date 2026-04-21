
import connectDB from './src/db/index.js';
import { resolveCustomerByDomain } from './src/services/emailPoller.js';
import { logger } from './src/logger.js';

async function testApprovedDomainIngestion() {
    const pool = connectDB();
    const conn = await pool.getConnection();
    
    const TEST_DOMAIN = 'shams-global.com';
    const TEST_EMAIL = `engineer@${TEST_DOMAIN}`;
    const TEST_CUSTOMER_NAME = 'Shams Enterprise';
    
    try {
        await conn.beginTransaction();

        // 1. Setup: Create a test customer and approve their private domain
        // 1. Find a valid project and user to avoid FK errors
        const [projects] = await conn.query("SELECT id FROM projects WHERE is_deleted = 0 LIMIT 1");
        const [users] = await conn.query("SELECT id FROM users WHERE is_active = 1 LIMIT 1");
        
        if (!projects.length || !users.length) {
            throw new Error("Cannot run test: No active projects or users found in DB.");
        }
        
        const validProjectId = projects[0].id;
        const validUserId = users[0].id;

        console.log(`\n--- 🧪 SETTING UP TEST: ${TEST_DOMAIN} ---`);
        const [cust] = await conn.query(
            "INSERT INTO customers (name, default_project_id) VALUES (?, ?)",
            [TEST_CUSTOMER_NAME, validProjectId]
        );
        const customerId = cust.insertId;

        await conn.query(
            "INSERT INTO customer_domains (customer_id, domain, is_active) VALUES (?, ?, 1)",
            [customerId, TEST_DOMAIN]
        );
        console.log(`✅ Created Customer '${TEST_CUSTOMER_NAME}' with Approved Domain '@${TEST_DOMAIN}'`);

        // 2. Simulate Ingestion Logic: resolveCustomerByDomain
        console.log(`\n--- 📥 SIMULATING INGESTION FROM: ${TEST_EMAIL} ---`);
        const identity = await resolveCustomerByDomain(
            conn, pool, TEST_EMAIL, 'Test Engineer', 'Critical Issue', 'Machine is down', 'msg-12345', null, [], 999
        );

        if (identity && identity.matchType === 'customer_domain') {
            console.log(`🚀 RESULT: SUCCESS!`);
            console.log(`   - Mapped to: ${identity.customerName} (ID: ${identity.customerId})`);
            console.log(`   - Project ID: ${identity.projectId}`);
            console.log(`   - Reason: This is a PRIVATE domain, so it bypassed the "Public Domain Rule" that blocks Gmail.`);
        } else {
            console.log(`❌ RESULT: FAILED or HELD.`);
            console.log(`   - Identity:`, identity);
        }

        // 3. Rollback so we don't pollute your real database
        await conn.rollback();
        console.log(`\n--- 🧹 CLEANUP COMPLETE (Database Rolled Back) ---`);

    } catch (err) {
        console.error('Test Error:', err);
    } finally {
        conn.release();
        await pool.end();
    }
}

testApprovedDomainIngestion();
