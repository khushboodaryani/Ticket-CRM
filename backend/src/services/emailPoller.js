// src/services/emailPoller.js
// Polls Gmail via IMAP and auto-creates tickets from unread emails.
// Fully modular — does NOT modify any existing controller or route.

import imapSimple from 'imap-simple';
import { simpleParser } from 'mailparser';
import cron from 'node-cron';
import connectDB from '../db/index.js';
import { logger } from '../logger.js';
import moment from 'moment-timezone';
import { sendTicketNotification, sendEmergencyBroadcast } from '../modules/notifications/emailService.js';
import fs from 'fs';

const TZ = process.env.TIMEZONE || 'Asia/Kolkata';

// In-memory state to avoid processing emails arrived before startup
const StartupTimestamp = Date.now() - (10 * 60 * 1000);
const skippedUids = new Set();

let activeConnection = null;
let isProcessing = false;

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

export async function processEmails(connection) {
    if (isProcessing) return;
    isProcessing = true;

    try {
        // Fetch only UNSEEN emails from TODAY to avoid processing backlog older items
        const dateStr = moment().format('DD-MMM-YYYY');
        const searchCriteria = ['UNSEEN', ['SINCE', dateStr]];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: false,
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        if (!messages.length) {
            isProcessing = false;
            return;
        }

        logger.info(`[EmailPoller] Found ${messages.length} unread email(s). Processing...`);

        const pool = connectDB();

        for (const msg of messages) {
            try {
                await processOneEmail(pool, msg, connection,
                    parseInt(process.env.EMAIL_DEFAULT_PROJECT_ID || '1', 10),
                    process.env.EMAIL_DEFAULT_PRIORITY || 'P3',
                    parseInt(process.env.EMAIL_SYSTEM_USER_ID || '5', 10)
                );
            } catch (err) {
                logger.error(`[EmailPoller] Failed to process one email: ${err.message}`);
            }
        }

    } catch (err) {
        logger.error(`[EmailPoller] Search error: ${err.message}`);
    } finally {
        isProcessing = false;
    }
}

async function processOneEmail(pool, msg, connection, defaultProjectId, defaultPriority, systemUserId) {
    const msgUid = msg.attributes.uid;
    logger.info(`[EmailPoller] processOneEmail triggered for UID: ${msgUid}`);

    // Get the full raw email to parse
    const allPart = msg.parts.find(p => p.which === '');
    if (!allPart) {
        logger.warn(`[EmailPoller] Missing body part ('' which) for UID: ${msgUid}. Available parts: ${msg.parts.map(p => p.which).join(', ')}`);
        return;
    }

    const parsed = await simpleParser(allPart.body);

    // Skip if already marked to be skipped in this session
    if (skippedUids.has(msgUid)) {
        return;
    }

    const fromRaw = parsed.from?.text || '';
    const senderEmail = normalizeEmail(fromRaw);
    const senderName = parsed.from?.value?.[0]?.name || senderEmail;
    const subject = (parsed.subject || 'No Subject').trim().slice(0, 100);
    const cleanSubject = subject.replace(/^(re|fwd|reply):\s*/i, '').replace(/\[?TKT-\d{8}-\d{4}\]?/i, '').trim();
    const bodyText = parsed.text ? parsed.text.trim() : (parsed.html ? stripHtml(parsed.html) : '');
    const description = bodyText.slice(0, 5000) || subject;

    if (!senderEmail) {
        logger.warn('[EmailPoller] Skipping email with no sender address.');
        return;
    }

    logger.info(`[EmailPoller] Processing email from: ${senderEmail} | Subject: "${subject}"`);

    // ── 0. Helper: Append Reply to Existing Ticket ──────────────────────────
    const appendReply = async (ticketId, ticketNumber) => {
        // Find or create conversation for this ticket
        let [convos] = await pool.query(
            'SELECT id FROM conversations WHERE ticket_id = ? AND source_channel = ? LIMIT 1',
            [ticketId, 'email']
        );

        let conversationId;
        if (convos.length) {
            conversationId = convos[0].id;
        } else {
            const [newConvo] = await pool.query(
                'INSERT INTO conversations (ticket_id, source_channel, participant_identity) VALUES (?,?,?)',
                [ticketId, 'email', senderEmail]
            );
            conversationId = newConvo.insertId;
        }

        // Add message to conversation
        const [msgResult] = await pool.query(
            `INSERT INTO conversation_messages (conversation_id, sender_type, sender_id, message_body, created_at)
             VALUES (?, 'customer', NULL, ?, NOW())`,
            [conversationId, bodyText]
        );
        const newMessageId = msgResult.insertId;

        // Emit Real-Time WebSocket trigger
        try {
            const { getIO } = await import('./socketService.js');
            const io = getIO();
            if (io) {
                io.emit('new_message', {
                    id: newMessageId,
                    ticket_id: ticketId,
                    conversation_id: conversationId,
                    sender_type: 'customer',
                    message_body: bodyText,
                    created_at: new Date().toISOString()
                });
                logger.info(`[EmailPoller] Emitted real-time new_message for existing ticket ${ticketId}`);
            }
        } catch (socketErr) {
            logger.warn(`[EmailPoller] Failed to emit WebSocket event: ${socketErr.message}`);
        }

        // Log activity
        await pool.query(
            `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?, 'comment', NULL, ?)`,
            [ticketId, `Customer replied via email: ${senderEmail}`]
        );

        // Mark email as read
        await connection.addFlags(msg.attributes.uid, ['\\Seen']);
        logger.info(`[EmailPoller] ✅ Reply added to ticket ${ticketNumber}`);
    };

    // ── 0b. Detect Reply from Subject and Headers ──────────────────────────
    let matchedTicketNumber = null;

    // 1. Match from Subject
    const ticketNumberMatch = subject.match(/\[?(TKT-\d{8}-\d{4})\]?/i);
    if (ticketNumberMatch) {
        matchedTicketNumber = ticketNumberMatch[1].toUpperCase();
    } else {
        // 2. Match from Headers (Fallback)
        const replyTo = parsed.inReplyTo || '';
        const refs = Array.isArray(parsed.references) ? parsed.references.join(' ') : (parsed.references || '');
        const combined = `${replyTo} ${refs}`;
        const headerMatch = combined.match(/<(TKT-\d{8}-\d{4})@ticketcrm\.local>/i);
        if (headerMatch) {
            matchedTicketNumber = headerMatch[1].toUpperCase();
            logger.info(`[EmailPoller] ✅ Threading matched via header reference: ${matchedTicketNumber}`);
        }
    }

    if (matchedTicketNumber) {
        const [existingTickets] = await pool.query(
            'SELECT id, customer_id FROM tickets WHERE ticket_number = ? LIMIT 1',
            [matchedTicketNumber]
        );

        if (existingTickets.length) {
            await appendReply(existingTickets[0].id, matchedTicketNumber);
            return;
        }
    }

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

    // ── 1b. Fallback: Check for Open Ticket with Same Subject ───────────────

    const [openTickets] = await pool.query(
        `SELECT id, ticket_number FROM tickets 
         WHERE customer_id = ? AND category = ? AND status NOT IN ('closed', 'resolved') 
         ORDER BY created_at DESC LIMIT 1`,
        [customerId, cleanSubject]
    );

    if (openTickets.length) {
        logger.info(`[EmailPoller] Subject Match: Appending to open ticket ${openTickets[0].ticket_number}`);
        await appendReply(openTickets[0].id, openTickets[0].ticket_number);
        return;
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

    // ── 3. Duplicate guard ──────────────────────────────────────────────────
    const [dupes] = await pool.query(
        `SELECT id FROM tickets
         WHERE customer_id = ? AND category = ? AND description = ? AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
         LIMIT 1`,
        [customerId, cleanSubject, description]
    );
    if (dupes.length) {
        logger.warn(`[EmailPoller] Skipping duplicate ticket for "${cleanSubject}" from ${senderEmail}`);
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

    // ── 4b. Dynamic Priority Parsing (Emergency Check) ───────────────
    let finalPriority = defaultPriority;
    const emergencyKeywords = ['server down', 'emergency', 'outage', 'critical', 'urgent', 'crashed'];
    const lowerSub = subject.toLowerCase();
    const lowerBody = bodyText.toLowerCase();
    
    if (emergencyKeywords.some(kw => lowerSub.includes(kw) || lowerBody.includes(kw))) {
        finalPriority = 'P1';
        logger.warn(`[EmailPoller] 🚨 Emergency keyword detected! Overriding priority to P1`);
    }

    // ── 5. Fetch SLA ETR ─────────────────────────────────────────────────────
    const [policies] = await pool.query(
        'SELECT resolution_time_hours FROM sla_policies WHERE priority = ?',
        [finalPriority]
    );
    const resHours = policies[0]?.resolution_time_hours || 2;
    const etr = moment().tz(TZ).add(resHours, 'hours').format('YYYY-MM-DD HH:mm:ss');

    // ── 6. Insert ticket ─────────────────────────────────────────────────────
    const [result] = await pool.query(
        `INSERT INTO tickets (ticket_number, customer_id, project_id, category, priority, description,
         attachment_url, status, escalation_level, sla_state, str, etr, created_by, assigned_to, source, queue_id)
         VALUES (?,?,?,?,?,?,?, 'open', 1, 'active', ?, ?, ?, ?, ?, ?)`,
        [ticketNumber, customerId, projectId, cleanSubject, finalPriority, description,
            null, now, etr, systemUserId, null, 'email', null]
    );
    const ticketId = result.insertId;

    // ── 7. Send Notification email back to sender ─────────────────────────────
    try {
        const ticketObj = {
            ticket_number: ticketNumber,
            category: cleanSubject,
            priority: finalPriority,
            description: description,
            etr: etr
        };
        await sendTicketNotification(ticketObj, senderEmail);
        
        if (finalPriority === 'P1') {
            await sendEmergencyBroadcast({ id: ticketId, ...ticketObj });
        }
    } catch (notifierErr) {
        logger.error(`[EmailPoller] Outbound notification failed: ${notifierErr.message}`);
    }

    // ── 7. Log activity ──────────────────────────────────────────────────────
    await pool.query(
        `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,'created',NULL,?)`,
        [ticketId, `Auto-created from email: ${senderEmail}`]
    );

    // ── 8. Create conversation envelope ──────────────────────────────────────
    const [convoResult] = await pool.query(
        `INSERT INTO conversations (ticket_id, source_channel, participant_identity) VALUES (?,'email',?)`,
        [ticketId, senderEmail]
    );
    const conversationId = convoResult.insertId;

    // ── 8b. Add initial email as first conversation message ──────────────────
    const [msgResult2] = await pool.query(
        `INSERT INTO conversation_messages (conversation_id, sender_type, sender_id, message_body, created_at)
         VALUES (?, 'customer', NULL, ?, NOW())`,
        [conversationId, bodyText]
    );
    const newMessageId2 = msgResult2.insertId;

    // Emit Real-Time WebSocket trigger
    try {
        const { getIO } = await import('./socketService.js');
        const io = getIO();
        if (io) {
            io.emit('new_message', {
                id: newMessageId2,
                ticket_id: ticketId,
                conversation_id: conversationId,
                sender_type: 'customer',
                message_body: bodyText,
                created_at: new Date().toISOString()
            });
            logger.info(`[EmailPoller] Emitted real-time new_message for NEW ticket ${ticketId}`);
        }
    } catch (_) { }

    // ── 9. Mark email as read ─────────────────────────────────────────────────
    await connection.addFlags(msg.attributes.uid, ['\\Seen']);

    logger.info(`[EmailPoller] ✅ Ticket ${ticketNumber} (ID: ${ticketId}) created from ${senderEmail}`);
}

// ─── scheduler ───────────────────────────────────────────────────────────────

export async function startEmailPoller() {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailPass) {
        logger.warn('[EmailPoller] GMAIL_USER or GMAIL_APP_PASSWORD not set — Email Poller will NOT start.');
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
            authTimeout: 15000,
        },
        onmail: function (numNewMail) {
            logger.info(`[EmailPoller] Instant New Mail Event triggers! Count: ${numNewMail}`);
            if (activeConnection) {
                processEmails(activeConnection);
            }
        }
    };

    logger.info(`[EmailPoller] Connecting to IMAP server for ${gmailUser}...`);

    try {
        if (activeConnection) {
            try { activeConnection.end(); } catch (_) { }
        }

        activeConnection = await imapSimple.connect(config);
        await activeConnection.openBox('INBOX');
        logger.info(`[EmailPoller] ✅ Continuous listening with IMAP IDLE enabled`);

        // Backup Cron: runs every 1 minute to catch emails if IMAP IDLE falls asleep
        cron.schedule('*/1 * * * *', () => {
            if (activeConnection && !isProcessing) {
                logger.debug('[EmailPoller] Scheduled fallback trigger scan processing...');
                processEmails(activeConnection);
            }
        });

        // Run initial scan once connected
        processEmails(activeConnection);

        // Reconnection logic
        activeConnection.imap.on('close', () => {
            logger.warn('[EmailPoller] Connection closed. Restarting listener in 5s...');
            setTimeout(startEmailPoller, 5000);
        });

        activeConnection.imap.on('error', (err) => {
            logger.error(`[EmailPoller] Connection Error: ${err.message}`);
        });

    } catch (err) {
        logger.error(`[EmailPoller] Initialization Failed: ${err.message}. Retrying in 10s...`);
        setTimeout(startEmailPoller, 10000);
    }
}
