#!/usr/bin/env node
/**
 * debug_priority_flow.js — Comprehensive Priority Flow Debugger
 * 
 * Tests the resolvePriorityFromText() logic AND verifies it against the live DB.
 * Run: node scripts/debug_priority_flow.js [--live]
 * 
 * --live  : Also test against the live production database (181.214.10.244)
 */

import dotenv from 'dotenv';
dotenv.config();

// ─── 1. Standalone copy of the FIXED resolvePriorityFromText ──────────────────

function resolvePriorityFromText(subject = '', body = '') {
    const subjectLower = (subject || '').toLowerCase();

    const hasWord = (text, word) => new RegExp(`\\b${word}\\b`, 'i').test(text);
    const hasPhrase = (text, phrase) => text.includes(phrase.toLowerCase());

    // Emergency detection: subject must contain an emergency phrase
    const emergencyPhrases = ['server down', 'system down', 'crash', 'emergency', 'outage'];
    const hasEmergencyPhrase = emergencyPhrases.some(phrase => hasPhrase(subjectLower, phrase));

    if (hasEmergencyPhrase) {
        return { categoryId: 1, isEmergency: true };
    }

    // Category keyword scan — subject only, word-boundary
    if (hasWord(subjectLower, 'critical')) {
        return { categoryId: 1, isEmergency: false };
    }
    if (hasWord(subjectLower, 'high') || hasWord(subjectLower, 'urgent')) {
        return { categoryId: 2, isEmergency: false };
    }
    if (hasWord(subjectLower, 'medium')) {
        return { categoryId: 3, isEmergency: false };
    }
    if (hasWord(subjectLower, 'low')) {
        return { categoryId: 4, isEmergency: false };
    }

    return { categoryId: 2, isEmergency: false };
}

// ─── 2. Test Cases ────────────────────────────────────────────────────────────

const CATEGORY_NAMES = { 1: 'Critical (P)', 2: 'High (Q)', 3: 'Medium (R)', 4: 'Low (S)' };

const testCases = [
    // === EMERGENCY CASES (should trigger P1 + broadcast) ===
    { subject: 'EMERGENCY - Production server down',           body: 'Please help immediately',           expectCat: 1, expectEmergency: true,  label: '🚨 Emergency + server down' },
    { subject: 'System crash detected on Node 3',              body: 'Cluster health critical',            expectCat: 1, expectEmergency: true,  label: '🚨 Crash in subject' },
    { subject: 'Emergency: API gateway outage',                body: 'All endpoints returning 503',        expectCat: 1, expectEmergency: true,  label: '🚨 Emergency + outage' },
    { subject: 'Server down - cannot access dashboard',        body: '',                                    expectCat: 1, expectEmergency: true,  label: '🚨 Server down' },
    { subject: 'System down after patch deployment',           body: 'Rolled back but still failing',      expectCat: 1, expectEmergency: true,  label: '🚨 System down' },

    // === CRITICAL (P-series, but NOT emergency - no broadcast) ===
    { subject: 'Critical bug in payment module',               body: 'Users cannot checkout',              expectCat: 1, expectEmergency: false, label: '🔴 Critical keyword (no emergency)' },
    { subject: 'Re: Critical update required',                 body: 'Please update ASAP',                 expectCat: 1, expectEmergency: false, label: '🔴 Critical in reply' },

    // === HIGH (Q-series) ===
    { subject: 'High priority: Login issue',                   body: 'Cannot login since morning',         expectCat: 2, expectEmergency: false, label: '🟠 High keyword' },
    { subject: 'Urgent: Customer data export failing',         body: 'Need this resolved today',           expectCat: 2, expectEmergency: false, label: '🟠 Urgent keyword' },

    // === MEDIUM (R-series) ===
    { subject: 'Medium priority: UI alignment issue',          body: 'Button misaligned on mobile',        expectCat: 3, expectEmergency: false, label: '🔵 Medium keyword' },

    // === LOW (S-series) ===
    { subject: 'Low priority: Update favicon',                 body: 'The current favicon is old',         expectCat: 4, expectEmergency: false, label: '🟢 Low keyword' },

    // === NO KEYWORD (default to High/Q) ===
    { subject: 'Cannot access the report page',               body: 'Getting 404 error',                  expectCat: 2, expectEmergency: false, label: '⚪ No keyword → default Q' },
    { subject: 'Re: Invoice #4521 query',                     body: 'Please check the attached invoice',  expectCat: 2, expectEmergency: false, label: '⚪ Normal reply → default Q' },

    // === FALSE POSITIVE TESTS (should NOT match keywords in body) ===
    { subject: 'Please check attached document',              body: 'This is a high priority matter that requires critical attention. The server crashed yesterday but is fine now.', expectCat: 2, expectEmergency: false, label: '✅ Keywords in BODY only → ignored' },
    { subject: 'Meeting notes from today',                    body: 'We discussed the low cost options and highlighted the medium risk items. Emergency exit routes were also reviewed.', expectCat: 2, expectEmergency: false, label: '✅ All keywords in BODY → ignored' },

    // === WORD BOUNDARY TESTS (should NOT match partial words) ===
    { subject: 'The highlighted features are ready',          body: '',                                    expectCat: 2, expectEmergency: false, label: '✅ "highlighted" ≠ "high"' },
    { subject: 'Lower cost estimate for the project',         body: '',                                    expectCat: 2, expectEmergency: false, label: '✅ "lower" ≠ "low"' },
    { subject: 'Allow critically important updates',          body: '',                                    expectCat: 2, expectEmergency: false, label: '✅ "critically" ≠ "critical"' },
    { subject: 'Showcase of medium-sized enterprises',        body: '',                                    expectCat: 3, expectEmergency: false, label: '🔵 "medium-sized" has word boundary "medium"' },
];

// ─── 3. Run Tests ─────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(100));
console.log('  🧪 PRIORITY FLOW DEBUG — resolvePriorityFromText() Unit Tests');
console.log('═'.repeat(100));

let passed = 0, failed = 0;

for (const tc of testCases) {
    const result = resolvePriorityFromText(tc.subject, tc.body);
    const catOk = result.categoryId === tc.expectCat;
    const emergOk = result.isEmergency === tc.expectEmergency;
    const ok = catOk && emergOk;

    if (ok) {
        passed++;
        console.log(`  ✅ PASS | ${tc.label}`);
        console.log(`         | Subject: "${tc.subject.slice(0, 60)}"`);
        console.log(`         | → Cat: ${CATEGORY_NAMES[result.categoryId]}, Emergency: ${result.isEmergency}`);
    } else {
        failed++;
        console.log(`  ❌ FAIL | ${tc.label}`);
        console.log(`         | Subject: "${tc.subject.slice(0, 60)}"`);
        console.log(`         | Expected: Cat=${CATEGORY_NAMES[tc.expectCat]}, Emergency=${tc.expectEmergency}`);
        console.log(`         | Got:      Cat=${CATEGORY_NAMES[result.categoryId]}, Emergency=${result.isEmergency}`);
    }
    console.log('  ' + '─'.repeat(96));
}

console.log(`\n  📊 Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests\n`);

// ─── 4. Live DB Verification ──────────────────────────────────────────────────

const isLive = process.argv.includes('--live');

if (isLive) {
    console.log('═'.repeat(100));
    console.log('  🌐 LIVE SERVER DATABASE VERIFICATION');
    console.log('═'.repeat(100));

    try {
        const mysql = await import('mysql2/promise');
        const pool = mysql.createPool({
            host: '181.214.10.244',
            user: 'root',
            password: 'WELcome@123',
            database: 'ticket_crm',
            port: 3306,
            waitForConnections: true,
            connectionLimit: 2,
        });

        // 1. Verify categories
        console.log('\n  📦 Categories:');
        const [cats] = await pool.query('SELECT * FROM sla_priority_categories WHERE is_active = 1 ORDER BY sort_order');
        for (const cat of cats) {
            console.log(`     ID=${cat.id} | ${cat.name} (${cat.prefix}) | sort_order=${cat.sort_order}`);
        }

        // 2. Verify priorities
        console.log('\n  🎯 Priorities:');
        const [prios] = await pool.query(`
            SELECT p.id, p.name, p.level, c.name as category, c.prefix, c.id as category_id
            FROM priorities p
            JOIN sla_priority_categories c ON p.category_id = c.id
            WHERE p.is_active = 1
            ORDER BY c.sort_order ASC, p.level ASC
        `);
        for (const p of prios) {
            console.log(`     ID=${p.id} | ${p.name} (${p.category}/${p.prefix}) | level=${p.level}`);
        }

        // 3. Simulate the full resolve flow for key test cases
        console.log('\n  🔄 Full Resolve Flow Simulation (against live DB):');
        
        const simulationCases = [
            { subject: 'Emergency server down', expectName: 'P1', expectEmergency: true },
            { subject: 'Critical bug found', expectName: 'P2', expectEmergency: false },
            { subject: 'High priority request', expectName: 'Q1', expectEmergency: false },
            { subject: 'Normal email no keywords', expectName: 'Q1', expectEmergency: false },
            { subject: 'Low priority task', expectName: 'S1', expectEmergency: false },
        ];

        for (const sim of simulationCases) {
            const { categoryId, isEmergency } = resolvePriorityFromText(sim.subject, '');
            const sortOrder = isEmergency ? 'ASC' : 'DESC';
            
            const [prioRows] = await pool.query(
                `SELECT id, name FROM priorities 
                 WHERE category_id = ? AND is_active = 1 
                 ORDER BY level ${sortOrder} LIMIT 1`,
                [categoryId]
            );
            
            const resolvedName = prioRows[0]?.name || 'UNKNOWN';
            const resolvedId = prioRows[0]?.id || '?';
            const match = resolvedName === sim.expectName;
            
            console.log(`     ${match ? '✅' : '❌'} "${sim.subject}" → ${resolvedName} (ID:${resolvedId}) | Emergency=${isEmergency} | Expected: ${sim.expectName}`);
        }

        // 4. Verify SLA policies exist for resolved priorities
        console.log('\n  📋 SLA Policies Check:');
        const [policies] = await pool.query(`
            SELECT sp.id, p.name as priority, sp.first_response_hrs, sp.resolution_hrs,
                   sp.escalation_1_min, sp.escalation_2_min, sp.escalation_3_min
            FROM sla_policies_new sp
            JOIN priorities p ON sp.priority_id = p.id
            WHERE sp.customer_id IS NULL AND sp.project_id IS NULL AND sp.is_active = 1
            ORDER BY p.category_id ASC, p.level ASC
        `);
        for (const pol of policies) {
            console.log(`     ${pol.priority}: Response=${pol.first_response_hrs}h, Resolution=${pol.resolution_hrs}h, Esc=[${pol.escalation_1_min}m, ${pol.escalation_2_min}m, ${pol.escalation_3_min}m]`);
        }

        await pool.end();
        console.log('\n  ✅ Live DB verification complete.\n');
    } catch (err) {
        console.error(`\n  ❌ Live DB connection failed: ${err.message}`);
        console.error('     Make sure the MySQL port (3306) is accessible from your machine.\n');
    }
} else {
    console.log('  ℹ️  Run with --live flag to also test against production DB:');
    console.log('     node scripts/debug_priority_flow.js --live\n');
}

if (failed > 0) {
    process.exit(1);
}
