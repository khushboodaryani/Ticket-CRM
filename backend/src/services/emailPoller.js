// src/services/emailPoller.js
// Polls Gmail via IMAP and auto-creates/threads tickets from unread emails.
// v2 — Fixed: CC threading, missing ticket.id in notification, race condition,
//             empty cleanSubject guard, TKT-number-only threading without customer lock.

import imapSimple from 'imap-simple';
import { simpleParser } from 'mailparser';
import cron from 'node-cron';
import connectDB from '../db/index.js';
import { logger } from '../logger.js';
import moment from 'moment-timezone';
import { sendTicketNotification, sendEmergencyBroadcast } from '../modules/notifications/emailService.js';

const TZ = process.env.TIMEZONE || 'Asia/Kolkata';

// Support inbox address — emails FROM this address should be ignored (our own notifications)
const SUPPORT_EMAIL = (process.env.EMAIL_USER || '').toLowerCase().trim();
const GMAIL_POLLER_EMAIL = (process.env.GMAIL_USER || '').toLowerCase().trim();

let activeConnection = null;
let isProcessing = false;
let lastProcessStart = 0;

// ─── helpers ────────────────────────────────────────────────────────────────

function stripHtml(html = '') {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeEmail(raw = '') {
    const match = raw.match(/<(.+?)>/);
    return (match ? match[1] : raw).trim().toLowerCase();
}

/**
 * Parse a mailparser address field (To / CC / From) into an array of normalized email strings.
 */
function parseAddressEmails(addressField) {
    if (!addressField) return [];
    const values = Array.isArray(addressField.value) ? addressField.value : [];
    return values
        .map(v => normalizeEmail(v.address || ''))
        .filter(e => e && e.includes('@'));
}

/**
 * Filter out our own support/poller addresses from a list so we don't
 * accidentally thread our own outgoing notification emails as replies.
 */
function filterOwnAddresses(emails) {
    return emails.filter(e => e !== SUPPORT_EMAIL && e !== GMAIL_POLLER_EMAIL);
}

// ─── core logic ─────────────────────────────────────────────────────────────

export async function processEmails(connection) {
    const now = Date.now();

    // Safety: reset stuck lock after 2 minutes
    if (isProcessing && (now - lastProcessStart > 120000)) {
        logger.warn('[EmailPoller] Hang detected (processing for >2m). Resetting lock.');
        isProcessing = false;
    }

    if (isProcessing) return;

    isProcessing = true;
    lastProcessStart = now;

    try {
        const dateStr = moment().format('DD-MMM-YYYY');
        const searchCriteria = ['UNSEEN', ['SINCE', dateStr]];
        const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: false };

        logger.info(`[EmailPoller] Scanning for UNSEEN emails since ${dateStr}...`);

        const searchPromise = connection.search(searchCriteria, fetchOptions);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('IMAP Search Timeout')), 30000)
        );

        const messages = await Promise.race([searchPromise, timeoutPromise]);

        if (!messages.length) {
            isProcessing = false;
            return;
        }

        logger.info(`[EmailPoller] Found ${messages.length} unread email(s).`);

        const pool = connectDB();
        for (const msg of messages) {
            try {
                await processOneEmail(
                    pool, msg, connection,
                    parseInt(process.env.EMAIL_DEFAULT_PROJECT_ID || '1', 10),
                    process.env.EMAIL_DEFAULT_PRIORITY || 'P3',
                    parseInt(process.env.EMAIL_SYSTEM_USER_ID || '5', 10)
                );
            } catch (err) {
                logger.error(`[EmailPoller] Failed email UID ${msg.attributes?.uid}: ${err.message}`);
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

    const allPart = msg.parts.find(p => p.which === '');
    if (!allPart) {
        logger.warn(`[EmailPoller] No body part for UID ${msgUid}`);
        return;
    }

    const parsed = await simpleParser(allPart.body);

    const fromRaw = parsed.from?.text || '';
    const senderEmail = normalizeEmail(fromRaw);
    const senderName = parsed.from?.value?.[0]?.name || senderEmail;

    // ── GUARD: Skip emails originating from our own support addresses ──────
    if (!senderEmail || senderEmail === SUPPORT_EMAIL || senderEmail === GMAIL_POLLER_EMAIL) {
        logger.info(`[EmailPoller] Skipping own notification email from ${senderEmail}`);
        await connection.addFlags(msg.attributes.uid, ['\\Seen']);
        return;
    }

    const subject = (parsed.subject || 'No Subject').trim().slice(0, 100);
    
    // Strip Re:/Fwd: prefix AND the TKT-number bracket — used as ticket category
    const cleanSubject = subject
        .replace(/^(re|fwd?|reply):\s*/i, '')
        .replace(/\[?TKT-\d{8}-\d{4}\]?\s*/gi, '')
        .trim() || 'General Inquiry'; // ← Bug #3 Fix: never allow empty cleanSubject

    const bodyText = parsed.text
        ? parsed.text.trim()
        : (parsed.html ? stripHtml(parsed.html) : '');
    const description = bodyText.slice(0, 5000) || subject;

    // Parse CC and To recipients (excluding own addresses)
    const toEmails = filterOwnAddresses(parseAddressEmails(parsed.to));
    const ccEmails = filterOwnAddresses(parseAddressEmails(parsed.cc));
    const allParticipants = [...new Set([...toEmails, ...ccEmails])]; // unique extra participants

    logger.info(`[EmailPoller] From: ${senderEmail} | Subject: "${subject}" | CC: [${ccEmails.join(', ')}]`);

    // ── Helper: Append reply to existing ticket ───────────────────────────
    const appendReply = async (ticketId, ticketNumber) => {
        let [convos] = await pool.query(
            'SELECT id FROM conversations WHERE ticket_id = ? AND source_channel = ? LIMIT 1',
            [ticketId, 'email']
        );

        let conversationId;
        if (convos.length) {
            conversationId = convos[0].id;
            // Update CC emails if new ones appear in this reply
            if (ccEmails.length > 0) {
                const [existing] = await pool.query('SELECT cc_emails FROM conversations WHERE id = ?', [conversationId]);
                const existingCCs = existing[0]?.cc_emails ? existing[0].cc_emails.split(',') : [];
                const merged = [...new Set([...existingCCs, ...ccEmails])].filter(Boolean);
                await pool.query('UPDATE conversations SET cc_emails = ? WHERE id = ?', [merged.join(','), conversationId]);
            }
        } else {
            const [newConvo] = await pool.query(
                'INSERT INTO conversations (ticket_id, source_channel, participant_identity, cc_emails) VALUES (?,?,?,?)',
                [ticketId, 'email', senderEmail, ccEmails.join(',') || null]
            );
            conversationId = newConvo.insertId;
        }

        // Duplicate guard: skip if identical body already added in last 15 min
        const [existing] = await pool.query(
            `SELECT id FROM conversation_messages 
             WHERE conversation_id = ? AND message_body = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE) LIMIT 1`,
            [conversationId, bodyText]
        );
        if (existing.length) {
            logger.warn(`[EmailPoller] Duplicate reply — skipping for ticket ${ticketNumber}`);
            await connection.addFlags(msg.attributes.uid, ['\\Seen']);
            return;
        }

        const [msgResult] = await pool.query(
            `INSERT INTO conversation_messages (conversation_id, sender_type, sender_id, message_body, created_at)
             VALUES (?, 'customer', NULL, ?, NOW())`,
            [conversationId, bodyText]
        );

        // Real-time push
        try {
            const { getIO } = await import('./socketService.js');
            const io = getIO();
            if (io) {
                io.emit('new_message', {
                    id: msgResult.insertId,
                    ticket_id: ticketId,
                    conversation_id: conversationId,
                    sender_type: 'customer',
                    sender_name: senderName,
                    message_body: bodyText,
                    created_at: new Date().toISOString()
                });
            }
        } catch (socketErr) {
            logger.warn(`[EmailPoller] Socket emit failed: ${socketErr.message}`);
        }

        await pool.query(
            `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?, 'comment', NULL, ?)`,
            [ticketId, `Customer replied via email: ${senderEmail}`]
        );

        await connection.addFlags(msg.attributes.uid, ['\\Seen']);
        logger.info(`[EmailPoller] ✅ Reply appended to ticket ${ticketNumber}`);
    };

    // ════════════════════════════════════════════════════════════════════════
    // STEP 1 — Match by TKT-number in subject (most reliable, sender-agnostic)
    // Bug #1 Fix: We match by ticket number ONLY, not by customer. This means
    // CC'd people replying with TKT number in subject will thread correctly.
    // ════════════════════════════════════════════════════════════════════════
    const ticketNumberMatch = subject.match(/(TKT-\d{8}-\d{4})/i);
    if (ticketNumberMatch) {
        const matchedTicketNumber = ticketNumberMatch[1].toUpperCase();
        const [existingTickets] = await pool.query(
            'SELECT id FROM tickets WHERE ticket_number = ? LIMIT 1',
            [matchedTicketNumber]
        );
        if (existingTickets.length) {
            logger.info(`[EmailPoller] ✅ Thread match via subject TKT-number: ${matchedTicketNumber}`);
            await appendReply(existingTickets[0].id, matchedTicketNumber);
            return;
        }
    }

    // STEP 2 — Match by In-Reply-To / References headers (secondary)
    const replyTo = parsed.inReplyTo || '';
    const refs = Array.isArray(parsed.references) ? parsed.references.join(' ') : (parsed.references || '');
    const combined = `${replyTo} ${refs}`;
    const headerMatch = combined.match(/(TKT-\d{8}-\d{4})@ticketcrm\.local/i);
    if (headerMatch) {
        const matchedNum = headerMatch[1].toUpperCase();
        const [rows] = await pool.query('SELECT id FROM tickets WHERE ticket_number = ? LIMIT 1', [matchedNum]);
        if (rows.length) {
            logger.info(`[EmailPoller] ✅ Thread match via email headers: ${matchedNum}`);
            await appendReply(rows[0].id, matchedNum);
            return;
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 3 — Find or create customer from sender email
    // ════════════════════════════════════════════════════════════════════════
    let [customers] = await pool.query('SELECT id FROM customers WHERE email = ? LIMIT 1', [senderEmail]);
    let customerId;
    if (customers.length) {
        customerId = customers[0].id;
    } else {
        const [result] = await pool.query('INSERT INTO customers (name, email) VALUES (?, ?)', [senderName, senderEmail]);
        customerId = result.insertId;
        logger.info(`[EmailPoller] Auto-created customer ID ${customerId} for ${senderEmail}`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 4 — Bug #4 Fix: Look up by CC participant emails
    // If a CC'd person replies and their email is stored as a CC on an existing ticket,
    // thread it in rather than creating a new ticket.
    // ════════════════════════════════════════════════════════════════════════
    if (senderEmail) {
        // Check if this sender was a CC participant in any open email ticket
        const [ccMatch] = await pool.query(
            `SELECT t.id, t.ticket_number FROM conversations c
             JOIN tickets t ON c.ticket_id = t.id
             WHERE c.source_channel = 'email'
               AND t.status NOT IN ('closed', 'resolved')
               AND FIND_IN_SET(?, REPLACE(COALESCE(c.cc_emails, ''), ' ', '')) > 0
             ORDER BY t.created_at DESC LIMIT 1`,
            [senderEmail]
        );
        if (ccMatch.length) {
            logger.info(`[EmailPoller] CC participant match: ${senderEmail} → ticket ${ccMatch[0].ticket_number}`);
            await appendReply(ccMatch[0].id, ccMatch[0].ticket_number);
            return;
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 5 — Subject fallback: open ticket from same sender + same subject
    // ════════════════════════════════════════════════════════════════════════
    const [openTickets] = await pool.query(
        `SELECT id, ticket_number FROM tickets 
         WHERE customer_id = ? AND category = ? AND status NOT IN ('closed', 'resolved') 
         ORDER BY created_at DESC LIMIT 1`,
        [customerId, cleanSubject]
    );
    if (openTickets.length) {
        logger.info(`[EmailPoller] Subject match – appending to ${openTickets[0].ticket_number}`);
        await appendReply(openTickets[0].id, openTickets[0].ticket_number);
        return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 6 — Create new ticket
    // ════════════════════════════════════════════════════════════════════════

    // Ensure project exists for customer
    let [projects] = await pool.query('SELECT id FROM projects WHERE customer_id = ? LIMIT 1', [customerId]);
    let projectId;
    if (projects.length) {
        projectId = projects[0].id;
    } else {
        const [defaultProject] = await pool.query('SELECT id FROM projects WHERE id = ? LIMIT 1', [defaultProjectId]);
        if (!defaultProject.length) {
            logger.error(`[EmailPoller] Default project ${defaultProjectId} not found. Cannot create ticket.`);
            return;
        }
        projectId = defaultProjectId;
    }

    // Duplicate guard
    const [dupes] = await pool.query(
        `SELECT id FROM tickets
         WHERE customer_id = ? AND category = ? AND description = ? AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE) LIMIT 1`,
        [customerId, cleanSubject, description]
    );
    if (dupes.length) {
        logger.warn(`[EmailPoller] Duplicate ticket – skipping "${cleanSubject}" from ${senderEmail}`);
        await connection.addFlags(msg.attributes.uid, ['\\Seen']);
        return;
    }

    // ── Bug #5 Fix: Atomic ticket number with GET_LOCK to prevent race condition ──
    const lockName = `ticket_seq_${moment().tz(TZ).format('YYYYMMDD')}`;
    await pool.query(`SELECT GET_LOCK(?, 5)`, [lockName]);

    let ticketNumber;
    try {
        const today = moment().tz(TZ).format('YYYYMMDD');
        const [countRow] = await pool.query(`SELECT COUNT(*) as cnt FROM tickets WHERE DATE(created_at) = CURDATE()`);
        const seq = String(countRow[0].cnt + 1).padStart(4, '0');
        ticketNumber = `TKT-${today}-${seq}`;
    } finally {
        await pool.query(`SELECT RELEASE_LOCK(?)`, [lockName]);
    }

    const now = moment().tz(TZ).format('YYYY-MM-DD HH:mm:ss');

    // Dynamic priority from emergency keywords
    let finalPriority = defaultPriority;
    const emergencyKeywords = ['server down', 'emergency', 'outage', 'critical', 'urgent', 'crashed'];
    if (emergencyKeywords.some(kw => subject.toLowerCase().includes(kw) || bodyText.toLowerCase().includes(kw))) {
        finalPriority = 'P1';
        logger.warn(`[EmailPoller] 🚨 Emergency keyword detected — overriding priority to P1`);
    }

    const [policies] = await pool.query('SELECT resolution_time_hours FROM sla_policies WHERE priority = ?', [finalPriority]);
    const resHours = policies[0]?.resolution_time_hours || 2;
    const etr = moment().tz(TZ).add(resHours, 'hours').format('YYYY-MM-DD HH:mm:ss');

    const [result] = await pool.query(
        `INSERT INTO tickets (ticket_number, customer_id, project_id, category, priority, description,
         attachment_url, status, escalation_level, sla_state, str, etr, created_by, assigned_to, source, queue_id)
         VALUES (?,?,?,?,?,?,?, 'open', 1, 'active', ?, ?, ?, ?, ?, ?)`,
        [ticketNumber, customerId, projectId, cleanSubject, finalPriority, description,
            null, now, etr, systemUserId, null, 'email', null]
    );
    const ticketId = result.insertId;

    // Activity log
    await pool.query(
        `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,'created',NULL,?)`,
        [ticketId, `Auto-created from email: ${senderEmail}`]
    );

    // Create conversation — store CC emails
    const [convoResult] = await pool.query(
        `INSERT INTO conversations (ticket_id, source_channel, participant_identity, cc_emails) VALUES (?,?,?,?)`,
        [ticketId, 'email', senderEmail, ccEmails.join(',') || null]
    );
    const conversationId = convoResult.insertId;

    // Store initial email as first message
    const [msgResult2] = await pool.query(
        `INSERT INTO conversation_messages (conversation_id, sender_type, sender_id, message_body, created_at)
         VALUES (?, 'customer', NULL, ?, NOW())`,
        [conversationId, bodyText]
    );

    // Real-time push for new ticket
    try {
        const { getIO } = await import('./socketService.js');
        const io = getIO();
        if (io) {
            io.emit('new_message', {
                id: msgResult2.insertId,
                ticket_id: ticketId,
                conversation_id: conversationId,
                sender_type: 'customer',
                sender_name: senderName,
                message_body: bodyText,
                created_at: new Date().toISOString()
            });
        }
    } catch (_) { }

    // ── Bug #2 Fix: Include `id: ticketId` in ticketObj ──────────────────────
    const ticketObj = {
        id: ticketId,           // ← WAS MISSING — needed for trail HTML and proper Message-ID
        ticket_number: ticketNumber,
        category: cleanSubject,
        priority: finalPriority,
        description: description,
        etr: etr
    };

    // Send acknowledgement to sender
    try {
        await sendTicketNotification(ticketObj, senderEmail);
    } catch (notifierErr) {
        logger.error(`[EmailPoller] Acknowledgement email failed: ${notifierErr.message}`);
    }

    // Also send CC recipients a courtesy copy of the acknowledgement
    if (ccEmails.length > 0) {
        for (const ccEmail of ccEmails) {
            try {
                await sendTicketNotification(ticketObj, ccEmail);
                logger.info(`[EmailPoller] CC acknowledgement sent to ${ccEmail}`);
            } catch (err) {
                logger.warn(`[EmailPoller] Failed CC ack to ${ccEmail}: ${err.message}`);
            }
        }
    }

    if (finalPriority === 'P1') {
        try {
            await sendEmergencyBroadcast({ id: ticketId, ...ticketObj });
        } catch (e) {
            logger.error(`[EmailPoller] Emergency broadcast failed: ${e.message}`);
        }
    }

    await connection.addFlags(msg.attributes.uid, ['\\Seen']);
    logger.info(`[EmailPoller] ✅ Ticket ${ticketNumber} (ID: ${ticketId}) created from ${senderEmail}${ccEmails.length ? ` | CC: ${ccEmails.join(', ')}` : ''}`);
}

// ─── scheduler ───────────────────────────────────────────────────────────────

export async function startEmailPoller() {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD?.trim();

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
            logger.info(`[EmailPoller] ✉️ IMAP IDLE push: ${numNewMail} new mail(s) — triggering instant scan`);
            if (activeConnection) processEmails(activeConnection);
        }
    };

    logger.info(`[EmailPoller] Connecting to IMAP for ${gmailUser}...`);

    try {
        if (activeConnection) {
            try { activeConnection.end(); } catch (_) { }
        }

        activeConnection = await imapSimple.connect(config);
        await activeConnection.openBox('INBOX');
        logger.info('[EmailPoller] ✅ Connected — IMAP IDLE active');

        // Fallback cron every minute in case IDLE misses anything
        cron.schedule('*/1 * * * *', () => {
            if (activeConnection && !isProcessing) {
                logger.debug('[EmailPoller] Scheduled fallback scan...');
                processEmails(activeConnection);
            }
        });

        // Initial scan on startup
        processEmails(activeConnection);

        activeConnection.imap.on('close', () => {
            logger.warn('[EmailPoller] IMAP connection closed. Reconnecting in 5s...');
            setTimeout(startEmailPoller, 5000);
        });

        activeConnection.imap.on('error', (err) => {
            logger.error(`[EmailPoller] IMAP error: ${err.message}`);
        });

    } catch (err) {
        logger.error(`[EmailPoller] Init failed: ${err.message}. Retrying in 10s...`);
        setTimeout(startEmailPoller, 10000);
    }
}
