#!/usr/bin/env node
/**
 * Full Pipeline Debug Script
 * Tests: email dedup, priority resolution, domain approval flow, workflow rules, conversation threading
 * Run: node backend/scripts/debug_full_pipeline.js
 */

import connectDB from '../src/db/index.js';
import { logger } from '../src/logger.js';

const pool = connectDB();
const PASS = '✅';
const FAIL = '❌';
const INFO = 'ℹ️';
let passed = 0, failed = 0;

function assert(condition, label) {
    if (condition) { console.log(`  ${PASS} ${label}`); passed++; }
    else { console.log(`  ${FAIL} ${label}`); failed++; }
}

async function run() {
    console.log('\n══════════════════════════════════════════════════');
    console.log('  FULL PIPELINE DEBUG — Pre-Push Verification');
    console.log('══════════════════════════════════════════════════\n');

    // ─── TEST 1: Email Poller Config ───
    console.log('─── 1. Email Poller Configuration ───');
    const pollerLookback = parseInt(process.env.EMAIL_POLLER_LOOKBACK_HOURS || '24', 10);
    console.log(`  ${INFO} LOOKBACK_HOURS = ${pollerLookback}`);
    assert(pollerLookback > 0 && pollerLookback <= 168, `Lookback window valid (${pollerLookback}h)`);

    // ─── TEST 2: Email Deduplication ───
    console.log('\n─── 2. Email Deduplication (email_logs) ───');
    const [recentLogs] = await pool.query(
        `SELECT COUNT(*) as total, 
                SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) as processed,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count
         FROM email_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );
    const logStats = recentLogs[0];
    console.log(`  ${INFO} Last 24h: ${logStats.total} total, ${logStats.processed} processed, ${logStats.failed_count} failed`);
    assert(logStats.failed_count === 0 || logStats.failed_count === null, 'No failed email processing in last 24h');

    // Check for duplicate message_ids (would indicate dedup failure)
    const [dupes] = await pool.query(
        `SELECT message_id, COUNT(*) as cnt FROM email_logs 
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND message_id IS NOT NULL
         GROUP BY message_id HAVING cnt > 1`
    );
    assert(dupes.length === 0, `No duplicate message_ids in email_logs (${dupes.length} dupes found)`);

    // ─── TEST 3: Priority Resolution ───
    console.log('\n─── 3. Priority Resolution (keyword mapping) ───');
    const [priorities] = await pool.query('SELECT id, name, category_id, level FROM priorities WHERE is_active = 1 ORDER BY category_id, level');
    console.log(`  ${INFO} Active priorities: ${priorities.map(p => p.name).join(', ')}`);
    assert(priorities.length > 0, 'At least one priority exists');

    // Verify category mapping
    const cats = [...new Set(priorities.map(p => p.category_id))];
    console.log(`  ${INFO} Categories covered: ${cats.join(', ')}`);
    assert(cats.length >= 2, 'At least 2 priority categories exist');

    // Test keyword → priority mapping for recent tickets
    const [recentTickets] = await pool.query(
        `SELECT ticket_number, subject, priority, priority_id, source 
         FROM tickets WHERE source = 'email' ORDER BY id DESC LIMIT 5`
    );
    for (const t of recentTickets) {
        const subjectLower = (t.subject || '').toLowerCase();
        let expectedCat = 'Q (default)';
        if (/\bcritical\b/.test(subjectLower)) expectedCat = 'P';
        else if (/\bhigh\b|\burgent\b/.test(subjectLower)) expectedCat = 'Q';
        else if (/\bmedium\b/.test(subjectLower)) expectedCat = 'R';
        else if (/\blow\b/.test(subjectLower)) expectedCat = 'S';
        
        const actualPrefix = t.priority?.[0] || '?';
        const matches = expectedCat.startsWith(actualPrefix);
        assert(matches, `${t.ticket_number}: "${t.subject.slice(0,40)}" → ${t.priority} (expected ${expectedCat}-series)`);
    }

    // ─── TEST 4: Ticket Number Format ───
    console.log('\n─── 4. Ticket Number Format ───');
    const [badNumbers] = await pool.query(
        `SELECT ticket_number FROM tickets WHERE ticket_number LIKE 'TKT-%' AND source = 'email'`
    );
    assert(badNumbers.length === 0, `No legacy TKT-YYYYMMDD format tickets (${badNumbers.length} found)`);
    
    const [goodNumbers] = await pool.query(
        `SELECT ticket_number FROM tickets WHERE source = 'email' ORDER BY id DESC LIMIT 3`
    );
    for (const t of goodNumbers) {
        const isValid = /^[A-Z]-\d{5}$/.test(t.ticket_number);
        assert(isValid, `${t.ticket_number} matches X-XXXXX format`);
    }

    // ─── TEST 5: Domain Approval Flow ───
    console.log('\n─── 5. Domain Approval Flow ───');
    const [pendingApprovals] = await pool.query(
        `SELECT dar.id, dar.domain, dar.status, 
                (SELECT COUNT(*) FROM held_emails he WHERE he.approval_request_id = dar.id) as held_count
         FROM domain_approval_requests dar ORDER BY dar.created_at DESC LIMIT 5`
    );
    console.log(`  ${INFO} Recent domain requests:`);
    for (const a of pendingApprovals) {
        console.log(`    - ${a.domain}: ${a.status} (${a.held_count} held emails)`);
    }

    // Verify held emails have message_ids (needed for threading)
    const [heldWithoutMsgId] = await pool.query(
        `SELECT COUNT(*) as cnt FROM held_emails WHERE message_id IS NULL`
    );
    assert(heldWithoutMsgId[0].cnt === 0, `All held emails have message_ids (${heldWithoutMsgId[0].cnt} missing)`);

    // ─── TEST 6: Workflow Rules ───
    console.log('\n─── 6. Workflow Rules & Queue Routing ───');
    const [rules] = await pool.query(
        `SELECT id, name, trigger_event, conditions, actions, is_active FROM workflow_rules ORDER BY priority DESC`
    );
    console.log(`  ${INFO} Total rules: ${rules.length} (${rules.filter(r => r.is_active).length} active)`);
    for (const r of rules) {
        const conds = typeof r.conditions === 'string' ? JSON.parse(r.conditions) : r.conditions;
        const acts = typeof r.actions === 'string' ? JSON.parse(r.actions) : r.actions;
        console.log(`    - [${r.is_active ? 'ON' : 'OFF'}] "${r.name}" | IF ${JSON.stringify(conds)} → ${JSON.stringify(acts)}`);
    }

    // Check if workflow_processed flag is set on recent tickets
    const [wpFlags] = await pool.query(
        `SELECT ticket_number, workflow_processed, queue_id FROM tickets WHERE source = 'email' ORDER BY id DESC LIMIT 5`
    );
    for (const t of wpFlags) {
        assert(t.workflow_processed === 1, `${t.ticket_number}: workflow_processed=${t.workflow_processed}, queue=${t.queue_id || 'default'}`);
    }

    // ─── TEST 7: Conversation Threading ───
    console.log('\n─── 7. Conversation Threading ───');
    const [convStats] = await pool.query(
        `SELECT t.ticket_number, t.subject,
                COUNT(cm.id) as msg_count,
                MIN(cm.created_at) as first_msg,
                MAX(cm.created_at) as last_msg
         FROM tickets t
         JOIN conversations c ON c.ticket_id = t.id
         JOIN conversation_messages cm ON cm.conversation_id = c.id
         WHERE t.source = 'email'
         GROUP BY t.id
         ORDER BY t.id DESC LIMIT 5`
    );
    for (const c of convStats) {
        assert(c.msg_count >= 1, `${c.ticket_number}: ${c.msg_count} message(s) in conversation`);
    }

    // Check for orphaned conversations (conv without messages)
    const [orphans] = await pool.query(
        `SELECT c.id, t.ticket_number FROM conversations c
         JOIN tickets t ON c.ticket_id = t.id
         LEFT JOIN conversation_messages cm ON cm.conversation_id = c.id
         WHERE cm.id IS NULL AND t.source = 'email'`
    );
    assert(orphans.length === 0, `No orphaned conversations (${orphans.length} found)`);

    // ─── TEST 8: SLA Computation ───
    console.log('\n─── 8. SLA & ETR Computation ───');
    const [slaTickets] = await pool.query(
        `SELECT ticket_number, priority, str, etr, sla_policy_id, resolved_timezone
         FROM tickets WHERE source = 'email' AND etr IS NOT NULL ORDER BY id DESC LIMIT 3`
    );
    for (const t of slaTickets) {
        assert(t.str !== null, `${t.ticket_number}: STR set (${t.str})`);
        assert(t.etr !== null, `${t.ticket_number}: ETR set (${t.etr})`);
        assert(t.sla_policy_id !== null, `${t.ticket_number}: SLA policy linked (id=${t.sla_policy_id})`);
    }

    // ─── TEST 9: Customer Domain Mapping ───
    console.log('\n─── 9. Customer Domain Mapping ───');
    const [domains] = await pool.query(
        `SELECT cd.domain, cd.is_active, c.name as customer, p.name as project
         FROM customer_domains cd
         JOIN customers c ON cd.customer_id = c.id
         LEFT JOIN projects p ON cd.project_id = p.id
         WHERE cd.is_active = 1`
    );
    console.log(`  ${INFO} Active domain mappings: ${domains.length}`);
    for (const d of domains) {
        console.log(`    - ${d.domain} → Customer: ${d.customer}, Project: ${d.project || '(default)'}`);
    }

    // ─── TEST 10: Notification Delivery ───
    console.log('\n─── 10. Notification Email Delivery ───');
    const [notifLogs] = await pool.query(
        `SELECT error_message, COUNT(*) as cnt 
         FROM email_logs 
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND error_message LIKE 'Outgoing%'
         GROUP BY error_message ORDER BY cnt DESC LIMIT 5`
    );
    for (const n of notifLogs) {
        console.log(`  ${INFO} ${n.error_message}: ${n.cnt} sent`);
    }

    // ─── SUMMARY ───
    console.log('\n══════════════════════════════════════════════════');
    console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
    console.log('══════════════════════════════════════════════════');
    
    if (failed === 0) {
        console.log(`\n  ${PASS} ALL TESTS PASSED — Safe to push!\n`);
    } else {
        console.log(`\n  ⚠️  ${failed} test(s) failed — review above before pushing.\n`);
    }

    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
    console.error('Script error:', err.message);
    process.exit(1);
});
