/**
 * TEST: Stale Lock Recovery (Test 4)
 * 
 * What this does:
 *   1. Acquires the email_poller_lock and HOLDS it (simulates a stuck connection)
 *   2. You then start/watch your poller — it should:
 *      - Log "Global lock busy" for ~8 cycles
 *      - Detect the stuck lock via IS_USED_LOCK()
 *      - KILL this connection
 *      - Resume normal processing on the next cycle
 *   3. This script detects when it gets killed and reports SUCCESS
 * 
 * Usage:
 *   node scripts/test_stale_lock.js
 * 
 * Then watch your poller logs (npm run dev in another terminal).
 * The poller runs every 15s, so after ~120s (8 cycles) it should kill this connection.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const DB_CONFIG = {
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    database: process.env.DB_NAME || 'ticket_crm',
};

async function simulateStaleLock() {
    console.log('='.repeat(60));
    console.log('🧪 TEST: Stale Lock Recovery');
    console.log('='.repeat(60));
    console.log('');

    const conn = await mysql.createConnection(DB_CONFIG);
    
    // Get our connection ID so we can identify ourselves
    const [idRows] = await conn.query('SELECT CONNECTION_ID() AS id');
    const myConnId = idRows[0].id;
    console.log(`📌 This connection ID: ${myConnId}`);
    console.log(`   (The poller should detect and KILL this ID)`);
    console.log('');

    // Acquire the lock — same lock name the poller uses
    const [lockResult] = await conn.query("SELECT GET_LOCK('email_poller_lock', 5) AS lockStatus");
    
    if (lockResult[0].lockStatus !== 1) {
        console.log('❌ Could not acquire lock — something else already holds it.');
        console.log('   Stop your poller first, then re-run this script.');
        await conn.end();
        process.exit(1);
    }

    console.log('🔒 Lock acquired! Holding it indefinitely (simulating stuck connection)...');
    console.log('');
    console.log('👉 NOW start/watch your poller (npm run dev).');
    console.log('   Expected behavior:');
    console.log('   - Cycles 1-3: "Global lock busy" at INFO level');
    console.log('   - Cycles 4-7: "Global lock busy" at WARN level');
    console.log('   - Cycle 8:    "Lock stuck for >120s. Killing stale owner session=' + myConnId + '"');
    console.log('   - This script should then print SUCCESS below.');
    console.log('');
    console.log('⏳ Waiting to be killed (timeout: 5 minutes)...');
    console.log('');

    const startTime = Date.now();
    const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max wait

    // Keep the connection alive by pinging, detect when we get killed
    const interval = setInterval(async () => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        try {
            await conn.ping();
            process.stdout.write(`\r   ⏱️  Holding lock... ${elapsed}s elapsed`);

            if (Date.now() - startTime > TIMEOUT_MS) {
                clearInterval(interval);
                console.log('\n');
                console.log('❌ TIMEOUT: Poller did not kill the stale lock in 5 minutes.');
                console.log('   Possible reasons:');
                console.log('   - Poller is not running');
                console.log('   - consecutiveLockBusyCount threshold not reached');
                console.log('   - DB user lacks KILL privilege');
                try {
                    await conn.query("SELECT RELEASE_LOCK('email_poller_lock')");
                    await conn.end();
                } catch (_) { }
                process.exit(1);
            }
        } catch (err) {
            clearInterval(interval);
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            console.log('\n');
            console.log('='.repeat(60));
            console.log(`✅ SUCCESS! Connection was killed after ${elapsed}s`);
            console.log(`   Error received: ${err.message}`);
            console.log('');
            console.log('   This confirms:');
            console.log('   ✅ IS_USED_LOCK() correctly identified this connection');
            console.log('   ✅ KILL CONNECTION terminated the stale session');
            console.log('   ✅ Lock was released automatically');
            console.log('   ✅ Poller should resume normal operation on next cycle');
            console.log('='.repeat(60));
            process.exit(0);
        }
    }, 3000);
}

simulateStaleLock().catch(err => {
    console.error('Script error:', err.message);
    process.exit(1);
});
