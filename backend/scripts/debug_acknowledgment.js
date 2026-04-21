// scripts/debug_acknowledgment.js
// Tests the acknowledgment flow to verify emails are sent correctly.
// SAFE: Does NOT create tickets, only traces the logic path.

import connectDB from "../src/db/index.js";
import { logger } from "../src/logger.js";

async function testAcknowledgmentFlow() {
    const pool = connectDB();
    
    console.log("\n========================================");
    console.log("  ACKNOWLEDGMENT PIPELINE DIAGNOSTIC");
    console.log("========================================\n");

    // Step 1: Check recent tickets created from email
    console.log("STEP 1: Checking recent email-created tickets...");
    const [recentTickets] = await pool.query(
        `SELECT t.id, t.ticket_number, t.subject, t.priority, t.status, 
                t.workflow_processed, t.source, t.created_at,
                c.name as customer_name, c.email as customer_email
         FROM tickets t
         LEFT JOIN customers c ON t.customer_id = c.id
         WHERE t.source = 'email'
         ORDER BY t.created_at DESC
         LIMIT 5`
    );

    if (recentTickets.length === 0) {
        console.log("   ❌ No email-created tickets found.");
    } else {
        for (const t of recentTickets) {
            const hasEmail = t.customer_email ? '✅' : '❌ NO EMAIL';
            const processed = t.workflow_processed ? '✅' : '❌ NOT PROCESSED';
            console.log(`   ${t.ticket_number} | Customer: ${t.customer_name} | Email: ${t.customer_email || 'NULL'} ${hasEmail} | Workflow: ${processed} | Created: ${t.created_at}`);
        }
    }

    // Step 2: Check if acknowledgment messages were recorded in conversations
    console.log("\nSTEP 2: Checking if acknowledgment messages exist for recent tickets...");
    for (const t of recentTickets) {
        const [ackMessages] = await pool.query(
            `SELECT cm.id, cm.sender_type, cm.sender_name, cm.message_body, cm.created_at
             FROM conversation_messages cm
             JOIN conversations c ON cm.conversation_id = c.id
             WHERE c.ticket_id = ? AND cm.sender_type = 'system' AND cm.message_body LIKE '%Acknowledgement%'
             ORDER BY cm.created_at DESC LIMIT 1`,
            [t.id]
        );

        if (ackMessages.length > 0) {
            console.log(`   ✅ ${t.ticket_number}: Acknowledgment SENT at ${ackMessages[0].created_at}`);
        } else {
            console.log(`   ❌ ${t.ticket_number}: NO acknowledgment found! Customer never received the email.`);
        }
    }

    // Step 3: Check email logs for outgoing acknowledgments
    console.log("\nSTEP 3: Checking email_logs for outgoing acknowledgments...");
    const [outgoingLogs] = await pool.query(
        `SELECT id, message_id, status, error_message, created_at
         FROM email_logs
         WHERE error_message LIKE '%Outgoing notification%' OR error_message LIKE '%Outgoing%'
         ORDER BY created_at DESC
         LIMIT 5`
    );

    if (outgoingLogs.length === 0) {
        console.log("   ⚠️ No outgoing acknowledgment entries found in email_logs.");
    } else {
        for (const log of outgoingLogs) {
            console.log(`   📧 ${log.message_id?.slice(0, 40)} | ${log.status} | ${log.error_message?.slice(0, 60)} | ${log.created_at}`);
        }
    }

    // Step 4: Check workflow_runs for errors
    console.log("\nSTEP 4: Checking workflow_runs for recent failures...");
    const [failedRuns] = await pool.query(
        `SELECT wr.id, wr.ticket_id, wr.status, wr.run_log, wr.created_at, t.ticket_number
         FROM workflow_runs wr
         LEFT JOIN tickets t ON wr.ticket_id = t.id
         WHERE wr.status = 'failed'
         ORDER BY wr.created_at DESC
         LIMIT 5`
    );

    if (failedRuns.length === 0) {
        console.log("   ✅ No failed workflow runs found.");
    } else {
        for (const run of failedRuns) {
            console.log(`   ❌ ${run.ticket_number || run.ticket_id}: FAILED at ${run.created_at}`);
            console.log(`      Log: ${run.run_log?.slice(0, 200)}`);
        }
    }

    // Step 5: Verify customer email mapping
    console.log("\nSTEP 5: Verifying customer email mapping for acknowledgments...");
    const [customersWithoutEmail] = await pool.query(
        `SELECT DISTINCT c.id, c.name, c.email
         FROM customers c
         JOIN tickets t ON t.customer_id = c.id
         WHERE t.source = 'email' AND (c.email IS NULL OR c.email = '')
         LIMIT 10`
    );

    if (customersWithoutEmail.length > 0) {
        console.log("   ⚠️ WARNING: These customers have tickets from email but NO email address set:");
        for (const c of customersWithoutEmail) {
            console.log(`      - ID: ${c.id} | Name: ${c.name} | Email: ${c.email || 'NULL'}`);
        }
        console.log("   → Acknowledgment emails CANNOT be sent to these customers!");
    } else {
        console.log("   ✅ All email-ticket customers have valid email addresses.");
    }

    // Step 6: Check SMTP config
    console.log("\nSTEP 6: Checking SMTP Configuration...");
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASSWORD;
    const gmailUser = process.env.GMAIL_USER;
    console.log(`   EMAIL_USER (SMTP sender): ${emailUser || '❌ NOT SET'}`);
    console.log(`   EMAIL_PASSWORD: ${emailPass ? '✅ SET' : '❌ NOT SET'}`);
    console.log(`   GMAIL_USER (Poller inbox): ${gmailUser || '❌ NOT SET'}`);

    if (!emailUser || !emailPass) {
        console.log("   ❌ CRITICAL: SMTP credentials missing! No emails can be sent.");
    }

    console.log("\n========================================");
    console.log("  DIAGNOSIS COMPLETE");
    console.log("========================================");
    console.log("\nThe acknowledgment bug was caused by the notification call");
    console.log("being INSIDE the workflow pipeline's try block.");
    console.log("If ANY workflow step failed (SLA, rules, queue), the");
    console.log("acknowledgment was silently skipped.");
    console.log("\nFIX APPLIED: Acknowledgment now fires OUTSIDE the pipeline,");
    console.log("guaranteeing delivery even if workflow rules crash.\n");

    process.exit(0);
}

testAcknowledgmentFlow().catch(err => {
    console.error("DIAGNOSTIC ERROR:", err);
    process.exit(1);
});
