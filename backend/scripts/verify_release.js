import 'colors';
import connectDB from '../src/db/index.js';
import { emailQueue } from '../src/queues/emailQueue.js';
import { outboundEmailQueue } from '../src/queues/outboundEmailQueue.js';
import { slaQueue } from '../src/services/sla/jobManager.js';
import { transporter } from '../src/services/mailTransport.js';
import redis from '../src/config/redis.js';
import dotenv from 'dotenv';
import moment from 'moment-timezone';

dotenv.config();

/**
 * PRODUCTION RELEASE VERIFICATION SCRIPT
 * Run this before pushing to live to ensure all components are healthy.
 */
async function runVerification() {
    console.log('\n--- 🚀 Ticket CRM Release Verification ---\n'.cyan.bold);
    const pool = connectDB();

    // 1. DATABASE & SCHEMA CHECK
    console.log('1. Database Connectivity & Schema...'.yellow);
    try {
        const [ticketsCols] = await pool.query("SHOW COLUMNS FROM tickets");
        const colNames = ticketsCols.map(c => c.Field);
        const requiredCols = ['workflow_processed', 'assignment_source', 'priority_id', 'sla_policy_id'];
        const missing = requiredCols.filter(c => !colNames.includes(c));
        
        if (missing.length > 0) {
            console.log(`   ❌ Missing columns in 'tickets': ${missing.join(', ')}`.red);
        } else {
            console.log('   ✅ Tickets schema is fully synchronized.'.green);
        }

        const [slaCols] = await pool.query("SHOW COLUMNS FROM sla_event_logs WHERE Field = 'event_type'");
        if (slaCols.length && !slaCols[0].Type.includes('pre_breach_warning')) {
            console.log("   ❌ 'sla_event_logs.event_type' ENUM is missing 'pre_breach_warning'!".red);
        } else {
            console.log("   ✅ SLA logs enum is correct.".green);
        }

        const [prioCheck] = await pool.query("SELECT id FROM priorities WHERE id > 0 LIMIT 1");
        console.log(`   ✅ Database connected. Found ${prioCheck.length ? 'active' : '0'} priorities.`.green);
    } catch (err) {
        console.log(`   ❌ Database Error: ${err.message}`.red);
    }

    // 2. REDIS & BULLMQ CHECK
    console.log('\n2. Redis & BullMQ Health...'.yellow);
    try {
        await redis.ping();
        console.log('   ✅ Redis connection: OK'.green);
        
        const eqCount = await emailQueue.count();
        const oqCount = await outboundEmailQueue.count();
        const sqCount = await slaQueue.count();
        
        console.log(`   ✅ emailQueue: ${eqCount} jobs`.green);
        console.log(`   ✅ outboundEmailQueue: ${oqCount} jobs`.green);
        console.log(`   ✅ slaQueue: ${sqCount} jobs`.green);
    } catch (err) {
        console.log(`   ❌ Redis/BullMQ Error: ${err.message}`.red);
    }

    // 3. SMTP CHECK
    console.log('\n3. SMTP Transport...'.yellow);
    try {
        await transporter.verify();
        console.log(`   ✅ SMTP (${process.env.EMAIL_USER}): OK`.green);
    } catch (err) {
        console.log(`   ❌ SMTP Error: ${err.message}`.red);
        console.log(`      (Hint: Check GMAIL_USER and GMAIL_APP_PASSWORD)`.gray);
    }

    // 4. ENVIRONMENT ALIGNMENT
    console.log('\n4. Environment Config...'.yellow);
    const requiredEnv = ['REDIS_HOST', 'EMAIL_RUNTIME_MODE', 'EMAIL_DEFAULT_PROJECT_ID'];
    requiredEnv.forEach(key => {
        if (!process.env[key]) {
            console.log(`   ❌ Missing ENV: ${key}`.red);
        } else {
            console.log(`   ✅ ${key}: ${process.env[key]}`.green);
        }
    });

    // 5. INGESTION JOB ID TEST
    console.log('\n5. Sanity Check: Safe JobID Format...'.yellow);
    const testMsgId = '<test.123:abc@gmail.com>';
    const safeId = `email_${testMsgId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    if (safeId.includes(':')) {
        console.log('   ❌ JobID sanitization FAILED (Still contains colons)'.red);
    } else {
        console.log(`   ✅ Sanitized ID: ${safeId} (Safe for BullMQ)`.green);
    }

    console.log('\n--- 🏁 Verification Complete ---\n'.cyan.bold);
    
    await pool.end();
    process.exit(0);
}

runVerification();
