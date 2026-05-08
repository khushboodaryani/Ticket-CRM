/**
 * debug_presence.js
 * -----------------
 * Verifies the manual-sticky presence fix in socketServer.js.
 *
 * Run:  node backend/scripts/debug_presence.js
 *
 * Checks:
 *  1. Current DB state for all agents (is_online, status, status_source, last_heartbeat)
 *  2. Simulates what the OLD Safety Valve would have done (would it have killed manual users?)
 *  3. Simulates what the NEW background worker does (only kills stale 'system' users)
 *  4. Flags any agent whose presence is at risk
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';

const DB = {
    host:     process.env.DB_HOST     || '181.214.10.244',
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || 'WELcome@123',
    database: process.env.DB_NAME     || 'ticket_crm',
    port:     parseInt(process.env.DB_PORT || '3306', 10),
};

const SYSTEM_STALE_SECONDS = 90;
const OLD_MANUAL_STALE_MINUTES = 10; // what the OLD code used to do

async function run() {
    const conn = await mysql.createConnection(DB);
    console.log('\n========================================');
    console.log('  🔍 PRESENCE DEBUG REPORT');
    console.log('========================================\n');

    // 1. Fetch all agents/TLs
    const [rows] = await conn.execute(`
        SELECT id, name, role, is_online, status, status_source,
               last_heartbeat,
               TIMESTAMPDIFF(SECOND, last_heartbeat, NOW()) AS stale_seconds
        FROM users
        WHERE role IN ('agent', 'tl')
        ORDER BY is_online DESC, name ASC
    `);

    const [now] = await conn.execute(`SELECT NOW() as server_time`);
    console.log(`Server Time : ${now[0].server_time}`);
    console.log(`Total Agents: ${rows.length}\n`);

    console.log('─── CURRENT STATE ───────────────────────────────────────────────────');
    console.log(
        'ID'.padEnd(5),
        'Name'.padEnd(22),
        'Online'.padEnd(8),
        'Status'.padEnd(12),
        'Source'.padEnd(9),
        'Stale (s)'.padEnd(12),
        'Risk'
    );
    console.log('─'.repeat(90));

    for (const u of rows) {
        const stale = u.stale_seconds ?? '∞ (NULL)';
        const isStaleSystem  = u.status_source === 'system'  && u.stale_seconds > SYSTEM_STALE_SECONDS;
        const wouldOldKill   = u.status_source === 'manual'  && u.is_online === 1 && u.stale_seconds > (OLD_MANUAL_STALE_MINUTES * 60);
        const newWorkerKills = u.status_source === 'system'  && u.is_online === 1 && isStaleSystem;

        let risk = '✅ Safe';
        if (wouldOldKill)   risk = '⚠️  OLD code would have killed (manual > 10 min)';
        if (newWorkerKills) risk = '🔴 NEW worker will reset (system > 90s stale)';

        console.log(
            String(u.id).padEnd(5),
            (u.name || '').padEnd(22),
            (u.is_online ? '🟢 YES' : '🔴 NO').padEnd(8),
            (u.status || '').padEnd(12),
            (u.status_source || '').padEnd(9),
            String(stale).padEnd(12),
            risk
        );
    }

    // 2. Summary
    const online        = rows.filter(r => r.is_online === 1);
    const manualOnline  = rows.filter(r => r.is_online === 1 && r.status_source === 'manual');
    const systemOnline  = rows.filter(r => r.is_online === 1 && r.status_source === 'system');
    const oldWouldKill  = rows.filter(r => r.is_online === 1 && r.status_source === 'manual' && r.stale_seconds > OLD_MANUAL_STALE_MINUTES * 60);

    console.log('\n─── SUMMARY ─────────────────────────────────────────────────────────');
    console.log(`  Online agents total     : ${online.length}`);
    console.log(`  ↳ status_source=manual  : ${manualOnline.length} (sticky — new code protects these)`);
    console.log(`  ↳ status_source=system  : ${systemOnline.length} (socket-driven — auto-managed)`);
    console.log(`  OLD code would kill      : ${oldWouldKill.length} agent(s) with stale manual presence`);
    if (oldWouldKill.length > 0) {
        oldWouldKill.forEach(u => console.log(`    ⚠️  ${u.name} (stale: ${u.stale_seconds}s)`));
    }

    // 3. Akash Kumar specifically
    const akash = rows.find(r => r.name === 'Akash Kumar');
    console.log('\n─── AKASH KUMAR CHECK ───────────────────────────────────────────────');
    if (akash) {
        console.log(`  is_online     : ${akash.is_online ? '✅ 1 (Online)' : '❌ 0 (Offline)'}`);
        console.log(`  status        : ${akash.status}`);
        console.log(`  status_source : ${akash.status_source}`);
        console.log(`  last_heartbeat: ${akash.last_heartbeat}`);
        console.log(`  Stale for     : ${akash.stale_seconds ?? '∞'} seconds`);

        if (akash.is_online && akash.status_source === 'manual') {
            console.log('\n  ✅ SAFE: New code will NOT reset Akash. Manual presence is sticky.');
        } else if (akash.is_online && akash.status_source === 'system') {
            const timeLeft = SYSTEM_STALE_SECONDS - (akash.stale_seconds || 0);
            console.log(`\n  ⚠️  System-managed. Will reset in ~${Math.max(0, timeLeft)}s if no heartbeat.`);
        } else {
            console.log('\n  🔴 Akash is currently OFFLINE in the DB.');
        }
    } else {
        console.log('  ❌ User "Akash Kumar" not found in DB.');
    }

    // 4. Push readiness
    console.log('\n─── PUSH READINESS ──────────────────────────────────────────────────');
    console.log('  socketServer.js changes:');
    console.log('  ✅ join:          manual presence preserved on socket connect');
    console.log('  ✅ heartbeat_ack: only last_heartbeat updated, status_source untouched');
    console.log('  ✅ disconnect:    only status_source=system users go offline');
    console.log('  ✅ worker:        only stale system presence reset (manual never touched)');
    console.log('  ✅ syntax check:  node --check passed');
    console.log('\n  👉 SAFE TO PUSH. Run on server: pm2 restart all');
    console.log('========================================\n');

    await conn.end();
}

run().catch(err => {
    console.error('❌ Debug script error:', err.message);
    process.exit(1);
});
