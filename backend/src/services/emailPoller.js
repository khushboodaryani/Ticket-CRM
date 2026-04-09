// src/services/emailPoller.js
// Polls Gmail via IMAP and auto-creates/threads tickets from unread emails.
// v3 — Improved Duplicate Prevention (Early Flagging) and Full Participant Tracking (To+CC mapping).

import imapSimple from 'imap-simple';
import { simpleParser } from 'mailparser';
import cron from 'node-cron';
import connectDB from '../db/index.js';
import { logger } from '../logger.js';
import moment from 'moment-timezone';
import { sendTicketNotification, sendEmergencyBroadcast, sendParticipantReplyNotification } from '../modules/notifications/emailService.js';
import { getShiftAssignee } from './assignmentService.js';
import { createNotification } from '../modules/notifications/notificationController.js';

const TZ = process.env.TIMEZONE || 'Asia/Kolkata';

// Support inbox address — emails FROM this address should be ignored
const SUPPORT_EMAIL = (process.env.EMAIL_USER || '').toLowerCase().trim();
const GMAIL_POLLER_EMAIL = (process.env.GMAIL_USER || '').toLowerCase().trim();

let activeConnection = null;
let isProcessing = false;
let lastProcessStart = 0;

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
 * Filter out our own support/poller addresses and the sender from a list.
 */
function filterParticipants(emails, sender) {
    const own = [SUPPORT_EMAIL, GMAIL_POLLER_EMAIL, sender ? sender.toLowerCase().trim() : ''];
    return emails.filter(e => e && !own.includes(e.toLowerCase().trim()));
}

// ─── core logic ─────────────────────────────────────────────────────────────

export async function processEmails(connection) {
    const now = Date.now();

    if (isProcessing && (now - lastProcessStart > 120000)) {
        logger.warn('[EmailPoller] Hang detected. Resetting lock.');
        isProcessing = false;
    }

    if (isProcessing) return;

    isProcessing = true;
    lastProcessStart = now;

    try {
        const dateStr = moment().format('DD-MMM-YYYY');
        const searchCriteria = ['UNSEEN', ['SINCE', dateStr]];
        const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: false };

        const messages = await connection.search(searchCriteria, fetchOptions);

        if (!messages.length) {
            isProcessing = false;
            return;
        }

        logger.info(`[EmailPoller] Found ${messages.length} unread email(s).`);

        const pool = connectDB();
        for (const msg of messages) {
            try {
                // Process the email first. We only mark as SEEN if processing succeeds.
                await processOneEmail(
                    pool, msg, connection,
                    parseInt(process.env.EMAIL_DEFAULT_PROJECT_ID || '1', 10),
                    process.env.EMAIL_DEFAULT_PRIORITY || 'P3',
                    parseInt(process.env.EMAIL_SYSTEM_USER_ID || '5', 10)
                );
                
                // Mark as SEEN only after successful processing to prevent swallowed emails.
                await connection.addFlags(msg.attributes.uid, ['\\Seen']);
            } catch (err) {
                logger.error(`[EmailPoller] Failed email UID ${msg.attributes?.uid}: ${err.message}`);
                // If it failed, we leave it UNSEEN so the next scan can try again.
            }
        }
    } catch (err) {
        logger.error(`[EmailPoller] Search error: ${err.message}`);
    } finally {
        isProcessing = false;
    }
}

async function processOneEmail(pool, msg, connection, defaultProjectId, defaultPriority, systemUserId) {
    const allPart = msg.parts.find(p => p.which === '');
    if (!allPart) return;

    const parsed = await simpleParser(allPart.body);
    const messageId = parsed.messageId;
    const inReplyTo = parsed.inReplyTo;
    const references = Array.isArray(parsed.references) ? parsed.references : (parsed.references ? [parsed.references] : []);
    const fromRaw = parsed.from?.text || '';
    const senderEmail = normalizeEmail(fromRaw);
    const senderName = parsed.from?.value?.[0]?.name || senderEmail;

    if (!senderEmail || senderEmail === SUPPORT_EMAIL || senderEmail === GMAIL_POLLER_EMAIL) {
        return;
    }

    const rawSubject = (parsed.subject || 'No Subject').trim();
    const cleanSubject = rawSubject
        .replace(/^(re|fwd?|reply):\s*/i, '')
        .replace(/\[?TKT-\d{8}-\d{4}\]?\s*/gi, '')
        .trim() || 'General Inquiry';

    const bodyText = parsed.text ? parsed.text.trim() : (parsed.html ? stripHtml(parsed.html) : '');
    const description = bodyText.slice(0, 5000) || rawSubject;

    // --- IDEMPOTENCY GATE (Early Exit) ---
    const [existingLog] = await pool.query(
        `SELECT id, status FROM email_logs WHERE message_id = ?`,
        [messageId]
    );

    if (existingLog.length) {
        if (existingLog[0].status === 'processed') {
            logger.info(`[EmailPoller] ℹ️ Skipping already processed message: ${messageId}`);
            return;
        }
    }

    const [existingMsg] = await pool.query(
        `SELECT id FROM conversation_messages WHERE message_id = ? LIMIT 1`,
        [messageId]
    );
    if (existingMsg.length) {
        logger.info(`[EmailPoller] ℹ️ Skipping duplicate message in DB: ${messageId}`);
        return;
    }

    // Standardize Participants (To+CC)
    const rawTo = parseAddressEmails(parsed.to);
    const rawCc = parseAddressEmails(parsed.cc);
    const participantList = filterParticipants([...new Set([...rawTo, ...rawCc])], senderEmail);

    let logId;
    if (existingLog.length) {
        logId = existingLog[0].id;
    } else {
        try {
            const [logRes] = await pool.query(
                `INSERT INTO email_logs (message_id, sender_email, subject, status) VALUES (?, ?, ?, 'retry_pending')`,
                [messageId, senderEmail, rawSubject.slice(0, 500)]
            );
            logId = logRes.insertId;
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') {
                logger.info(`[EmailPoller] 🏎️ Race Condition: Message ${messageId} already being handled by another worker.`);
                return; // Silent exit
            }
            logger.error(`[EmailPoller] Log error: ${e.message}`);
        }
    }

    const appendReply = async (ticketId, conversationId, ticketNumber) => {
        // Redundant check for extreme safety
        const [doubleCheck] = await pool.query(`SELECT id FROM conversation_messages WHERE message_id = ?`, [messageId]);
        if (doubleCheck.length) return;

        // 2. Insert Message with headers
        const [msgResult] = await pool.query(
            `INSERT INTO conversation_messages 
             (conversation_id, sender_type, sender_name, message_body, message_id, in_reply_to, reference_chain)
             VALUES (?, 'customer', ?, ?, ?, ?, ?)`,
            [conversationId, senderName, bodyText, messageId, inReplyTo, references.join(' ')]
        );

        // 3. Sync Participants to relational table
        for (const email of participantList) {
            await pool.query(
                `INSERT IGNORE INTO conversation_participants (conversation_id, email, type) VALUES (?, ?, 'cc')`,
                [conversationId, email]
            );
        }

        // 4. Activity Log
        await pool.query(
            `INSERT INTO ticket_activities (ticket_id, action, note) VALUES (?, 'comment', ?)`,
            [ticketId, `Email reply from ${senderEmail}`]
        );

        // 5. Broadcast
        try {
            const { getIO } = await import('./socketService.js');
            const io = getIO();
            if (io) io.emit('new_message', {
                id: msgResult.insertId,
                ticket_id: ticketId,
                conversation_id: conversationId,
                sender_type: 'customer',
                sender_name: senderName,
                message_body: bodyText,
                created_at: new Date().toISOString()
            });
        } catch (_) {}

        // 6. Notify Participants
        try {
            const [tRows] = await pool.query('SELECT id, ticket_number, category, priority FROM tickets WHERE id = ?', [ticketId]);
            if (tRows.length) {
                await sendParticipantReplyNotification(tRows[0], senderEmail, bodyText);
            }
        } catch (err) {
            logger.error(`[EmailPoller] Sync notification failed: ${err.message}`);
        }

        if (logId) await pool.query(`UPDATE email_logs SET status='processed' WHERE id=?`, [logId]);
        logger.info(`[EmailPoller] ✅ Threaded reply to ${ticketNumber}`);
    };

    try {
        let matchedTicketId = null;
        let matchedConvId = null;
        let matchedNum = null;

        // --- STEP 1: Strict Header Matching (Thread IDs) ---
        if (inReplyTo) {
            const [msgMatch] = await pool.query(
                `SELECT c.id as conv_id, c.ticket_id, t.ticket_number 
                 FROM conversation_messages cm
                 JOIN conversations c ON cm.conversation_id = c.id
                 JOIN tickets t ON c.ticket_id = t.id
                 WHERE cm.message_id = ? LIMIT 1`,
                [inReplyTo]
            );
            if (msgMatch.length) {
                matchedConvId = msgMatch[0].conv_id;
                matchedTicketId = msgMatch[0].ticket_id;
                matchedNum = msgMatch[0].ticket_number;
                logger.debug(`[EmailPoller] Header Match (In-Reply-To): ${matchedNum}`);
            }
        }

        if (!matchedTicketId && references.length > 0) {
            for (const ref of references) {
                const [refMatch] = await pool.query(
                    `SELECT c.id as conv_id, c.ticket_id, t.ticket_number 
                     FROM conversation_messages cm
                     JOIN conversations c ON cm.conversation_id = c.id
                     JOIN tickets t ON c.ticket_id = t.id
                     WHERE cm.message_id = ? LIMIT 1`,
                    [ref]
                );
                if (refMatch.length) {
                    matchedConvId = refMatch[0].conv_id;
                    matchedTicketId = refMatch[0].ticket_id;
                    matchedNum = refMatch[0].ticket_number;
                    logger.debug(`[EmailPoller] Header Match (References): ${matchedNum}`);
                    break;
                }
            }
        }

        // --- STEP 2: Subject Pattern Match (TKT Number) ---
        if (!matchedTicketId) {
            const ticketNumberMatch = rawSubject.match(/(TKT-\d{8}-\d{4})/i);
            if (ticketNumberMatch) {
                const tktNum = ticketNumberMatch[1].toUpperCase();
                const [tktRows] = await pool.query(
                    `SELECT t.id, c.id as conv_id FROM tickets t
                     LEFT JOIN conversations c ON c.ticket_id = t.id
                     WHERE t.ticket_number = ? LIMIT 1`,
                    [tktNum]
                );
                if (tktRows.length) {
                    matchedTicketId = tktRows[0].id;
                    matchedConvId = tktRows[0].conv_id;
                    matchedNum = tktNum;
                    logger.debug(`[EmailPoller] Subject Pattern Match: ${matchedNum}`);
                }
            }
        }

        // --- STEP 3: Participant Fallback Safety Net ---
        if (!matchedTicketId) {
            // If headers/subject fail, check if sender is part of exactly one active conversation
            const [pMatches] = await pool.query(
                `SELECT cp.conversation_id, c.ticket_id, t.ticket_number 
                 FROM conversation_participants cp
                 JOIN conversations c ON cp.conversation_id = c.id
                 JOIN tickets t ON c.ticket_id = t.id
                 WHERE cp.email = ? AND t.status NOT IN ('resolved', 'closed')`,
                [senderEmail]
            );
            if (pMatches.length === 1) {
                matchedConvId = pMatches[0].conversation_id;
                matchedTicketId = pMatches[0].ticket_id;
                matchedNum = pMatches[0].ticket_number;
                logger.info(`[EmailPoller] 🛡️ Participant Fallback Match: ${matchedNum}`);
            }
        }

        // --- STEP 4: Attach or Create ---
        if (matchedTicketId && matchedConvId) {
            await appendReply(matchedTicketId, matchedConvId, matchedNum);
            return;
        }

        // Create New Ticket
        let [customers] = await pool.query('SELECT id FROM customers WHERE email = ? LIMIT 1', [senderEmail]);
        let customerId;
        if (customers.length) {
            customerId = customers[0].id;
        } else {
            const [res] = await pool.query('INSERT INTO customers (name, email) VALUES (?, ?)', [senderName, senderEmail]);
            customerId = res.insertId;
        }

        const today = moment().tz(TZ).format('YYYYMMDD');
        const lockName = `ticket_seq_${today}`;
        await pool.query(`SELECT GET_LOCK(?, 5)`, [lockName]);
        let ticketNumber;
        try {
            const [countRow] = await pool.query(`SELECT COUNT(*) as cnt FROM tickets WHERE DATE(created_at) = CURDATE()`);
            const seq = String(countRow[0].cnt + 1).padStart(4, '0');
            ticketNumber = `TKT-${today}-${seq}`;
        } finally {
            await pool.query(`SELECT RELEASE_LOCK(?)`, [lockName]);
        }

        const nowStr = moment().tz(TZ).format('YYYY-MM-DD HH:mm:ss');
        let finalPriority = defaultPriority;
        const emergencyKeywords = ['server down', 'emergency', 'outage', 'critical', 'urgent', 'crashed'];
        if (emergencyKeywords.some(kw => rawSubject.toLowerCase().includes(kw) || bodyText.toLowerCase().includes(kw))) finalPriority = 'P1';

        const [policies] = await pool.query('SELECT resolution_time_hours FROM sla_policies WHERE priority = ?', [finalPriority]);
        const etr = moment().tz(TZ).add(policies[0]?.resolution_time_hours || 2, 'hours').format('YYYY-MM-DD HH:mm:ss');
        const finalAssigneeId = await getShiftAssignee(finalPriority);

        const [tResult] = await pool.query(
            `INSERT INTO tickets (ticket_number, subject, customer_id, project_id, category, priority, description, status, escalation_level, sla_state, str, etr, created_by, assigned_to, source)
             VALUES (?,?,?,?,?,?,?, 'open', 1, 'active', ?, ?, ?, ?, 'email')`,
            [ticketNumber, rawSubject.slice(0, 500), customerId, defaultProjectId, cleanSubject.slice(0, 250), finalPriority, description, nowStr, etr, systemUserId, finalAssigneeId]
        );
        const ticketId = tResult.insertId;

        const [cvResult] = await pool.query(
            `INSERT INTO conversations (ticket_id, source_channel, root_message_id, customer_id) VALUES (?,?,?,?)`,
            [ticketId, 'email', messageId, customerId]
        );
        const conversationId = cvResult.insertId;

        await pool.query(
            `INSERT INTO conversation_messages (conversation_id, sender_type, sender_name, message_body, message_id, reference_chain)
             VALUES (?, 'customer', ?, ?, ?, ?)`,
            [conversationId, senderName, bodyText, messageId, references.join(' ')]
        );

        // Add Participants
        await pool.query(`INSERT INTO conversation_participants (conversation_id, email, type) VALUES (?, ?, 'to')`, [conversationId, senderEmail]);
        for (const email of participantList) {
            await pool.query(`INSERT IGNORE INTO conversation_participants (conversation_id, email, type) VALUES (?, ?, 'cc')`, [conversationId, email]);
        }

        await pool.query('INSERT INTO ticket_activities (ticket_id, action, note) VALUES (?, "created", ?)', [ticketId, `Auto-created from email: ${senderEmail}`]);

        // Notifications
        const ticketObj = { id: ticketId, ticket_number: ticketNumber, category: cleanSubject.slice(0, 250), priority: finalPriority, description: description, etr: etr };
        try { await sendTicketNotification(ticketObj, senderEmail); } catch (_) {}
        if (finalPriority === 'P1') try { await sendEmergencyBroadcast({ id: ticketId, ...ticketObj }); } catch (_) {}
        if (finalAssigneeId) {
            await createNotification(pool, {
                user_id: finalAssigneeId,
                type: 'ticket_assigned',
                title: `Auto-Assigned: ${ticketNumber}`,
                body: `You have been auto-assigned a new email ticket: ${cleanSubject}`,
                entity_id: ticketId
            });
        }

        if (logId) await pool.query(`UPDATE email_logs SET status='processed' WHERE id=?`, [logId]);
        logger.info(`[EmailPoller] 🆕 Created ticket ${ticketNumber}`);

    } catch (err) {
        if (logId) await pool.query(`UPDATE email_logs SET status='failed', error_message=? WHERE id=?`, [err.message, logId]);
        throw err;
    }
}

export async function startEmailPoller() {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = (process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASSWORD)?.trim();
    if (!gmailUser || !gmailPass) return;

    const config = {
        imap: { user: gmailUser, password: gmailPass, host: 'imap.gmail.com', port: 993, tls: true, tlsOptions: { rejectUnauthorized: false }, authTimeout: 15000 },
        onmail: function (numNewMail) {
            if (activeConnection) processEmails(activeConnection);
        }
    };

    try {
        if (activeConnection) { try { activeConnection.end(); } catch (_) {} }
        activeConnection = await imapSimple.connect(config);
        await activeConnection.openBox('INBOX');
        logger.info(`[EmailPoller] ✅ IMAP connected to ${gmailUser}`);
        cron.schedule('*/1 * * * *', () => { if (activeConnection && !isProcessing) processEmails(activeConnection); });
        processEmails(activeConnection);
        activeConnection.imap.on('close', () => setTimeout(startEmailPoller, 5000));
    } catch (err) {
        logger.error(`[EmailPoller] IMAP connection failed: ${err.message}`);
        setTimeout(startEmailPoller, 10000);
    }
}
