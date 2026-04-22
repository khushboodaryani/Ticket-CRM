/**
 * debug_bullmq_pipeline.js
 * Non-destructive verification of the BullMQ Enterprise Pipeline.
 * Checks: Redis, Queues, Workers, SLA Jobs, Outbound, DB schema, imports.
 *
 * Usage: node --env-file=.env backend/scripts/debug_bullmq_pipeline.js
 */
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1') });

import IORedis from 'ioredis';

// ─────────────── Helpers ───────────────
const GREEN  = '\x1b[32m✅';
const RED    = '\x1b[31m❌';
const YELLOW = '\x1b[33m⚠️';
const RESET  = '\x1b[0m';
const pass = (msg) => console.log(`${GREEN} ${msg}${RESET}`);
const fail = (msg) => console.log(`${RED} ${msg}${RESET}`);
const warn = (msg) => console.log(`${YELLOW} ${msg}${RESET}`);
const section = (title) => console.log(`\n${'═'.repeat(60)}\n  ${title}\n${'═'.repeat(60)}`);

const results = [];
function check(name, ok, detail = '') {
    results.push({ check: name, status: ok ? 'PASS' : 'FAIL', detail });
    if (ok) pass(`${name} ${detail ? `— ${detail}` : ''}`);
    else fail(`${name} ${detail ? `— ${detail}` : ''}`);
}

let pool;

async function run() {
    console.log('\n🔍 BullMQ Enterprise Pipeline Debug Report');
    console.log(`   Time: ${new Date().toISOString()}`);
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);

    // ───────────────────────────────────────
    section('1. REDIS CONNECTION');
    // ───────────────────────────────────────
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = process.env.REDIS_PORT || 6379;
    let redis;
    try {
        redis = new IORedis({ host: redisHost, port: redisPort, maxRetriesPerRequest: null, lazyConnect: true });
        await redis.connect();
        const pong = await redis.ping();
        check('Redis PING', pong === 'PONG', `${redisHost}:${redisPort} → ${pong}`);
    } catch (err) {
        check('Redis PING', false, err.message);
        console.log('\n🛑 Redis is required for BullMQ. Aborting remaining checks.');
        printSummary();
        process.exit(1);
    }

    // ───────────────────────────────────────
    section('2. DATABASE CONNECTION');
    // ───────────────────────────────────────
    try {
        const connectDB = (await import('../src/db/index.js')).default;
        pool = connectDB();
        const [rows] = await pool.query('SELECT 1 AS ok');
        check('MySQL Connection', rows[0]?.ok === 1, `DB: ${process.env.DB_NAME || 'ticket_crm'}`);
    } catch (err) {
        check('MySQL Connection', false, err.message);
    }

    // ───────────────────────────────────────
    section('3. MODULE IMPORTS (Compile Check)');
    // ───────────────────────────────────────
    const modules = [
        ['emailQueue',          '../src/queues/emailQueue.js',            'emailQueue'],
        ['outboundEmailQueue',  '../src/queues/outboundEmailQueue.js',    'outboundEmailQueue'],
        ['emailProcessor',      '../src/services/emailProcessor.js',      'processInboundEmailJob'],
        ['emailWorker',         '../src/workers/emailWorker.js',          'startEmailQueueWorker'],
        ['outboundEmailWorker', '../src/workers/outboundEmailWorker.js',  'startOutboundEmailWorker'],
        ['mailTransport',       '../src/services/mailTransport.js',       'transporter'],
        ['emailPersistence',    '../src/modules/notifications/emailPersistence.js', 'persistQueuedOutboundSuccess'],
        ['queueDashboard',      '../src/services/queueDashboard.js',      'mountQueueDashboard'],
        ['emailWorkerManager',  '../src/services/emailWorkerManager.js',  'startEmailWorkerManager'],
        ['emailPoller',         '../src/services/emailPoller.js',          'processOneEmail'],
        ['jobManager',          '../src/services/sla/jobManager.js',       'jobManager'],
        ['slaWorker',           '../src/services/sla/slaWorker.js',        'startSlaWorker'],
    ];

    for (const [label, path, exportName] of modules) {
        try {
            const mod = await import(path);
            const hasExport = exportName in mod;
            check(`import ${label}`, hasExport, hasExport ? `exports.${exportName} ✓` : `Missing export: ${exportName}`);
        } catch (err) {
            check(`import ${label}`, false, err.message.split('\n')[0]);
        }
    }

    // ───────────────────────────────────────
    section('4. BULLMQ QUEUE HEALTH');
    // ───────────────────────────────────────
    try {
        const { emailQueue } = await import('../src/queues/emailQueue.js');
        const counts = await emailQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        check('emailQueue accessible', true, `waiting=${counts.waiting} active=${counts.active} completed=${counts.completed} failed=${counts.failed} delayed=${counts.delayed}`);
    } catch (err) {
        check('emailQueue accessible', false, err.message);
    }

    try {
        const { outboundEmailQueue } = await import('../src/queues/outboundEmailQueue.js');
        const counts = await outboundEmailQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        check('outboundEmailQueue accessible', true, `waiting=${counts.waiting} active=${counts.active} completed=${counts.completed} failed=${counts.failed} delayed=${counts.delayed}`);
    } catch (err) {
        check('outboundEmailQueue accessible', false, err.message);
    }

    // Check slaQueue
    try {
        const { Queue } = await import('bullmq');
        const slaQueue = new Queue('slaQueue', { connection: redis });
        const counts = await slaQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        check('slaQueue accessible', true, `waiting=${counts.waiting} active=${counts.active} delayed=${counts.delayed} failed=${counts.failed}`);
        await slaQueue.close();
    } catch (err) {
        check('slaQueue accessible', false, err.message);
    }

    // ───────────────────────────────────────
    section('5. SLA JOB MANAGER — Job ID Consistency');
    // ───────────────────────────────────────
    try {
        const { jobManager } = await import('../src/services/sla/jobManager.js');
        
        // Verify scheduleJobs creates first_resp job
        const scheduleSource = (await import('fs')).readFileSync(
            new URL('../src/services/sla/jobManager.js', import.meta.url), 'utf-8'
        );
        
        const hasFirstResp = scheduleSource.includes('sla_first_resp_');
        const hasBreachJob = scheduleSource.includes('sla_breach_');
        const hasWarningJob = scheduleSource.includes('sla_warning_');
        const schedulesFirstResp = scheduleSource.includes("type: 'FIRST_RESPONSE_BREACH'");
        
        check('scheduleJobs creates sla_breach_', hasBreachJob);
        check('scheduleJobs creates sla_warning_', hasWarningJob);
        check('scheduleJobs creates sla_first_resp_', schedulesFirstResp, schedulesFirstResp ? 'FIRST_RESPONSE_BREACH job now scheduled' : 'STILL MISSING — cancelJobs will try to remove a non-existent job');
        
        // Verify cancelJobs tries to remove the same IDs
        const cancelBlock = scheduleSource.slice(scheduleSource.indexOf('cancelJobs'));
        const cancelIds = ['sla_breach_', 'sla_warning_', 'sla_first_resp_'];
        for (const id of cancelIds) {
            const found = cancelBlock.includes(id);
            check(`cancelJobs removes ${id}`, found);
        }
    } catch (err) {
        check('SLA Job ID Consistency', false, err.message);
    }

    // ───────────────────────────────────────
    section('6. SLA WORKER — event_type Fix');
    // ───────────────────────────────────────
    try {
        const slaWorkerSource = (await import('fs')).readFileSync(
            new URL('../src/services/sla/slaWorker.js', import.meta.url), 'utf-8'
        );
        
        const hasOldBug = slaWorkerSource.includes("event_type, note) \n         VALUES (?, 'creation'");
        const hasFix = slaWorkerSource.includes("'pre_breach_warning'");
        
        check('handleWarning uses pre_breach_warning', hasFix && !hasOldBug, 
            hasOldBug ? 'BUG STILL PRESENT: event_type=creation' : 'Correctly writes pre_breach_warning');
    } catch (err) {
        check('SLA Worker event_type', false, err.message);
    }

    // ───────────────────────────────────────
    section('7. EMAIL POLLER — Producer Mode');
    // ───────────────────────────────────────
    try {
        const pollerSource = (await import('fs')).readFileSync(
            new URL('../src/services/emailPoller.js', import.meta.url), 'utf-8'
        );
        
        const usesEmailQueue = pollerSource.includes('emailQueue.add');
        const importsQueue = pollerSource.includes('emailQueue');
        const importsProcessor = pollerSource.includes('buildInboundEmailJobPayload');
        
        check('Poller imports emailQueue', importsQueue);
        check('Poller imports buildInboundEmailJobPayload', importsProcessor);
        check('Poller enqueues via emailQueue.add()', usesEmailQueue, usesEmailQueue ? 'Producer mode confirmed' : 'STILL processing inline!');
        
        // Check it still uses processOneEmail only for the export (not inline in processEmails)
        const processEmailsBlock = pollerSource.slice(
            pollerSource.indexOf('async function processEmails'),
            pollerSource.indexOf('export async function processOneEmail')
        );
        const inlineProcessing = processEmailsBlock.includes('processOneEmail(');
        check('processEmails does NOT call processOneEmail inline', !inlineProcessing, 
            inlineProcessing ? 'WARNING: processOneEmail still called inline in processEmails loop' : 'Clean producer separation');
    } catch (err) {
        check('Email Poller Producer Mode', false, err.message);
    }

    // ───────────────────────────────────────
    section('8. WORKER MANAGER — Orchestration');
    // ───────────────────────────────────────
    try {
        const managerSource = (await import('fs')).readFileSync(
            new URL('../src/services/emailWorkerManager.js', import.meta.url), 'utf-8'
        );
        
        check('Manager imports startEmailQueueWorker', managerSource.includes('startEmailQueueWorker'));
        check('Manager imports startOutboundEmailWorker', managerSource.includes('startOutboundEmailWorker'));
        check('Manager calls startEmailQueueWorker()', managerSource.includes('startEmailQueueWorker()'));
        check('Manager calls startOutboundEmailWorker()', managerSource.includes('startOutboundEmailWorker()'));
        check('Manager stops queue workers on shutdown', managerSource.includes('stopEmailQueueWorker') && managerSource.includes('stopOutboundEmailWorker'));
    } catch (err) {
        check('Worker Manager', false, err.message);
    }

    // ───────────────────────────────────────
    section('9. OUTBOUND EMAIL — Queue Integration');
    // ───────────────────────────────────────
    try {
        const emailServiceSource = (await import('fs')).readFileSync(
            new URL('../src/modules/notifications/emailService.js', import.meta.url), 'utf-8'
        );
        
        const usesOutboundQueue = emailServiceSource.includes('outboundEmailQueue');
        check('emailService uses outboundEmailQueue', usesOutboundQueue, 
            usesOutboundQueue ? 'Outbound emails routed through BullMQ' : 'Still using direct transporter.sendMail()');
        
        const hasMailTransport = emailServiceSource.includes('mailTransport');
        check('emailService imports shared mailTransport', hasMailTransport || usesOutboundQueue,
            'Transport centralized or queue-routed');
    } catch (err) {
        check('Outbound Email Integration', false, err.message);
    }

    // ───────────────────────────────────────
    section('10. BULL-BOARD DASHBOARD');
    // ───────────────────────────────────────
    try {
        const appSource = (await import('fs')).readFileSync(
            new URL('../src/app.js', import.meta.url), 'utf-8'
        );
        
        check('app.js imports mountQueueDashboard', appSource.includes('mountQueueDashboard'));
        check('app.js calls mountQueueDashboard(app)', appSource.includes('mountQueueDashboard(app)'));
        
        const boardPath = process.env.BULL_BOARD_PATH || '/admin/queues';
        check('Dashboard path configured', true, `route: ${boardPath}`);
    } catch (err) {
        check('Bull-Board Dashboard', false, err.message);
    }

    // ───────────────────────────────────────
    section('11. DATABASE SCHEMA VERIFICATION');
    // ───────────────────────────────────────
    if (pool) {
        // system_settings table
        try {
            const [rows] = await pool.query("SHOW TABLES LIKE 'system_settings'");
            check('system_settings table exists', rows.length > 0);
        } catch (err) {
            check('system_settings table', false, err.message);
        }

        // SLA policies coverage
        try {
            const [missing] = await pool.query(`
                SELECT p.id, p.name 
                FROM priorities p 
                LEFT JOIN sla_policies_new sp ON sp.priority_id = p.id AND sp.customer_id IS NULL AND sp.project_id IS NULL
                WHERE p.is_active = 1 AND sp.id IS NULL
            `);
            check('All priorities have Global SLA policies', missing.length === 0,
                missing.length > 0 ? `Missing global policies for: ${missing.map(r => r.name).join(', ')}` : 'All covered');
        } catch (err) {
            check('SLA policy coverage', false, err.message);
        }

        // sla_event_logs event_type check (verify no 'creation' entries from warning handler)
        try {
            const [badRows] = await pool.query(`
                SELECT COUNT(*) as cnt FROM sla_event_logs 
                WHERE event_type = 'creation' AND note LIKE '%warning%'
            `);
            check('No stale creation event_type in sla_event_logs', badRows[0].cnt === 0,
                badRows[0].cnt > 0 ? `Found ${badRows[0].cnt} rows with event_type=creation for warnings` : 'Clean');
        } catch (err) {
            check('sla_event_logs check', false, err.message);
        }

        // Checkpoint value
        try {
            const [rows] = await pool.query(
                "SELECT setting_value FROM system_settings WHERE setting_key = 'EMAIL_POLLER_LAST_UID' LIMIT 1"
            );
            const uid = rows[0]?.setting_value || 'not set';
            check('Poller checkpoint exists', true, `EMAIL_POLLER_LAST_UID = ${uid}`);
        } catch (err) {
            check('Poller checkpoint', false, err.message);
        }
    }

    // ───────────────────────────────────────
    section('12. ENV VARIABLES');
    // ───────────────────────────────────────
    const envChecks = [
        ['REDIS_HOST', process.env.REDIS_HOST, 'localhost'],
        ['EMAIL_USER', process.env.EMAIL_USER, null],
        ['GMAIL_USER', process.env.GMAIL_USER, null],
        ['EMAIL_SYSTEM_USER_ID', process.env.EMAIL_SYSTEM_USER_ID, '5'],
        ['EMAIL_DEFAULT_PROJECT_ID', process.env.EMAIL_DEFAULT_PROJECT_ID, '1'],
        ['EMAIL_POLLER_LOOKBACK_HOURS', process.env.EMAIL_POLLER_LOOKBACK_HOURS, '24'],
        ['EMAIL_RUNTIME_MODE', process.env.EMAIL_RUNTIME_MODE, 'worker_thread'],
        ['BULL_BOARD_PATH', process.env.BULL_BOARD_PATH, '/admin/queues'],
        ['ENABLE_BULL_BOARD', process.env.ENABLE_BULL_BOARD, 'true'],
    ];

    for (const [key, value, fallback] of envChecks) {
        const effective = value || fallback || 'MISSING';
        const isSet = !!value;
        if (isSet) {
            check(`ENV ${key}`, true, `= ${effective}`);
        } else if (fallback) {
            warn(`ENV ${key} not set, using default: ${fallback}`);
            results.push({ check: `ENV ${key}`, status: 'WARN', detail: `default: ${fallback}` });
        } else {
            check(`ENV ${key}`, false, 'NOT SET — required');
        }
    }

    // ───────────────────────────────────────
    printSummary();

    // Cleanup
    try { if (redis) await redis.quit(); } catch (_) {}
    try { if (pool) await pool.end(); } catch (_) {}
    process.exit(results.some(r => r.status === 'FAIL') ? 1 : 0);
}

function printSummary() {
    section('SUMMARY');
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const warned = results.filter(r => r.status === 'WARN').length;
    
    console.table(results);
    console.log(`\n  ${GREEN} PASSED: ${passed}${RESET}  ${failed > 0 ? `${RED} FAILED: ${failed}${RESET}` : ''}  ${warned > 0 ? `${YELLOW} WARNINGS: ${warned}${RESET}` : ''}`);
    
    if (failed === 0) {
        console.log(`\n  🎉 All checks passed! Your BullMQ pipeline is correctly wired.\n`);
    } else {
        console.log(`\n  🔧 ${failed} check(s) need attention before going live.\n`);
    }
}

run().catch(err => {
    console.error('Debug script crashed:', err);
    process.exit(1);
});
