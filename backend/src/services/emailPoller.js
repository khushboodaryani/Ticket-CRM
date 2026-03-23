// src/services/emailPoller.js
// Polls Gmail via IMAP and auto-creates tickets from unread emails.
// Fully modular — does NOT modify any existing controller or route.

import imapSimple from 'imap-simple';
import { simpleParser } from 'mailparser';
import cron from 'node-cron';
import connectDB from '../db/index.js';
import { logger } from '../logger.js';
import moment from 'moment-timezone';
import { sendTicketNotification } from '../modules/notifications/emailService.js';

const TZ = process.env.TIMEZONE || 'Asia/Kolkata';

// ─── helpers ────────────────────────────────────────────────────────────────

function stripHtml(html = '') {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeEmail(raw = '') {
    // handle "Name <email@domain>" or plain "email@domain"
    const match = raw.match(/<(.+?)>/);
    return (match ? match[1] : raw).trim().toLowerCase();
}

// ─── core logic ─────────────────────────────────────────────────────────────

export async function processEmails() {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    const defaultProjectId = parseInt(process.env.EMAIL_DEFAULT_PROJECT_ID || '1', 10);
    const defaultPriority = process.env.EMAIL_DEFAULT_PRIORITY || 'P3';
    const systemUserId = parseInt(process.env.EMAIL_SYSTEM_USER_ID || '5', 10);

    if (!gmailUser || !gmailPass) {
        logger.warn('[EmailPoller] GMAIL_USER or GMAIL_APP_PASSWORD not set. Skipping poll.');
        return;
    }

    const config = {
        imap: {
            user: gmailUser,
            password: gmailPass,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false },
            authTimeout: 10000,
        },
    };

    let connection;
    try {
        connection = await imapSimple.connect(config);
        await connection.openBox('INBOX');

        // Fetch only UNSEEN emails from TODAY to avoid processing backlog older items
        const dateStr = moment().format('DD-MMM-YYYY');
        const searchCriteria = ['UNSEEN', ['SINCE', dateStr]];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: false, // we'll mark seen ourselves after processing
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        if (!messages.length) {
            logger.info('[EmailPoller] No new emails.');
            connection.end();
            return;
        }

        logger.info(`[EmailPoller] Found ${messages.length} unread email(s). Processing...`);

        const pool = connectDB();

        for (const msg of messages) {
            try {
                await processOneEmail(pool, msg, connection, defaultProjectId, defaultPriority, systemUserId);
            } catch (err) {
                logger.error(`[EmailPoller] Failed to process one email: ${err.message}`);
            }
        }

        connection.end();
    } catch (err) {
        logger.error(`[EmailPoller] IMAP connection error: ${err.message}`);
        if (connection) {
            try { connection.end(); } catch (_) {}
        }
    }
}

async function processOneEmail(pool, msg, connection, defaultProjectId, defaultPriority, systemUserId) {
    // Get the full raw email to parse
    const allPart = msg.parts.find(p => p.which === '');
    if (!allPart) return;

    const parsed = await simpleParser(allPart.body);

    const fromRaw = parsed.from?.text || '';
    const senderEmail = normalizeEmail(fromRaw);
    const senderName = parsed.from?.value?.[0]?.name || senderEmail;
    const subject = (parsed.subject || 'No Subject').trim().slice(0, 100);
    const bodyText = parsed.text ? parsed.text.trim() : (parsed.html ? stripHtml(parsed.html) : '');
    const description = bodyText.slice(0, 5000) || subject;

    if (!senderEmail) {
        logger.warn('[EmailPoller] Skipping email with no sender address.');
        return;
    }

    logger.info(`[EmailPoller] Processing email from: ${senderEmail} | Subject: "${subject}"`);

    // ── 1. Find or create customer by email ──────────────────────────────────
    let [customers] = await pool.query(
        'SELECT id FROM customers WHERE email = ? LIMIT 1',
        [senderEmail]
    );

    let customerId;
    if (customers.length) {
        customerId = customers[0].id;
    } else {
        // Auto-create a new customer from the sender
        const [result] = await pool.query(
            'INSERT INTO customers (name, email) VALUES (?, ?)',
            [senderName, senderEmail]
        );
        customerId = result.insertId;
        logger.info(`[EmailPoller] Auto-created customer ID ${customerId} for ${senderEmail}`);
    }

    // ── 2. Ensure a valid project exists for this customer ───────────────────
    let [projects] = await pool.query(
        'SELECT id FROM projects WHERE customer_id = ? LIMIT 1',
        [customerId]
    );

    let projectId;
    if (projects.length) {
        projectId = projects[0].id;
    } else {
        // Fall back to the global default project
        const [defaultProject] = await pool.query(
            'SELECT id FROM projects WHERE id = ? LIMIT 1',
            [defaultProjectId]
        );
        if (!defaultProject.length) {
            logger.error(`[EmailPoller] Default project ID ${defaultProjectId} not found. Cannot create ticket.`);
            return;
        }
        projectId = defaultProjectId;
    }

    // ── 3. Duplicate guard — same sender + same subject in last 10 minutes ───
    const [dupes] = await pool.query(
        `SELECT id FROM tickets
         WHERE customer_id = ? AND category = ? AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
         LIMIT 1`,
        [customerId, subject]
    );
    if (dupes.length) {
        logger.warn(`[EmailPoller] Skipping duplicate ticket for "${subject}" from ${senderEmail}`);
        // Still mark as read so we don't re-process
        await connection.addFlags(msg.attributes.uid, ['\\Seen']);
        return;
    }

    // ── 4. Build ticket number ───────────────────────────────────────────────
    const now = moment().tz(TZ).format('YYYY-MM-DD HH:mm:ss');
    const today = moment().tz(TZ).format('YYYYMMDD');
    const [countRow] = await pool.query(
        `SELECT COUNT(*) as cnt FROM tickets WHERE DATE(created_at) = CURDATE()`
    );
    const seq = String(countRow[0].cnt + 1).padStart(4, '0');
    const ticketNumber = `TKT-${today}-${seq}`;

    // ── 5. Fetch SLA ETR ─────────────────────────────────────────────────────
    const [policies] = await pool.query(
        'SELECT resolution_time_hours FROM sla_policies WHERE priority = ?',
        [defaultPriority]
    );
    const resHours = policies[0]?.resolution_time_hours || 2;
    const etr = moment().tz(TZ).add(resHours, 'hours').format('YYYY-MM-DD HH:mm:ss');

    // ── 6. Insert ticket ─────────────────────────────────────────────────────
    const [result] = await pool.query(
        `INSERT INTO tickets (ticket_number, customer_id, project_id, category, priority, description,
         attachment_url, status, escalation_level, sla_state, str, etr, created_by, assigned_to, source, queue_id)
         VALUES (?,?,?,?,?,?,?, 'open', 1, 'active', ?, ?, ?, ?, ?, ?)`,
        [ticketNumber, customerId, projectId, subject, defaultPriority, description,
         null, now, etr, systemUserId, null, 'email', null]
    );
    const ticketId = result.insertId;

    // ── 7. Send Notification email back to sender ─────────────────────────────
    try {
        const ticketObj = {
            ticket_number: ticketNumber,
            category: subject,
            priority: defaultPriority,
            description: description,
            etr: etr
        };
        await sendTicketNotification(ticketObj, senderEmail);
    } catch (notifierErr) {
        logger.error(`[EmailPoller] Outbound notification failed: ${notifierErr.message}`);
    }

    // ── 7. Log activity ──────────────────────────────────────────────────────
    await pool.query(
        `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,'created',NULL,?)`,
        [ticketId, `Auto-created from email: ${senderEmail}`]
    );

    // ── 8. Create conversation envelope ──────────────────────────────────────
    await pool.query(
        `INSERT INTO conversations (ticket_id, source_channel, participant_identity) VALUES (?,'email',?)`,
        [ticketId, senderEmail]
    );

    // ── 9. Mark email as read ─────────────────────────────────────────────────
    await connection.addFlags(msg.attributes.uid, ['\\Seen']);

    logger.info(`[EmailPoller] ✅ Ticket ${ticketNumber} (ID: ${ticketId}) created from ${senderEmail}`);
}

// ─── scheduler ───────────────────────────────────────────────────────────────

export function startEmailPoller() {
    const interval = process.env.EMAIL_POLL_INTERVAL || '*/2 * * * *';
    const gmailUser = process.env.GMAIL_USER;

    if (!gmailUser) {
        logger.warn('[EmailPoller] GMAIL_USER not set — Email Poller will NOT start.');
        return;
    }

    logger.info(`[EmailPoller] Starting with cron: "${interval}" for ${gmailUser}`);

    // Run once immediately on startup
    processEmails();

    cron.schedule(interval, () => {
        processEmails();
    });
}
