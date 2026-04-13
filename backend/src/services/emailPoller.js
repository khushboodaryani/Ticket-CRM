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
let reconnectAttempts = 0;
let isCronInitialized = false;

// Reconnection Constants
const BACKOFF_BASE = 5000;  // 5 seconds
const MAX_BACKOFF = 300000; // 5 minutes (300s)
const MAX_ATTEMPTS = 50;    // Absolute ceiling for safety

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
 * Detect if an email is an automated response (OOO, Auto-reply, Bounce).
 */
function isAutoReply(parsed) {
    // 1. RFC 3834 Auto-Submitted header
    const autoSubmitted = parsed.headers?.get('auto-submitted');
    if (autoSubmitted && autoSubmitted !== 'no') return true;

    // 2. Microsoft Exchange X-Auto-Response-Suppress
    if (parsed.headers?.get('x-auto-response-suppress')) return true;

    // 3. Precedence: bulk
    if (parsed.headers?.get('precedence') === 'bulk') return true;

    // 4. Subject-based detection
    const subject = (parsed.subject || '').toLowerCase();
    const autoKeywords = [
        'out of office', 'automatic reply', 'auto-reply', 'autoreply',
        'no-reply', 'vacation response', 'away from my desk',
        'delivered', 'delivery status', 'undeliverable', 'failure notice'
    ];
    if (autoKeywords.some(kw => subject.includes(kw))) return true;

    // 5. From address detection
    const from = parsed.from?.text?.toLowerCase() || '';
    if (from.includes('mailer-daemon') || from.includes('postmaster') || from.includes('no-reply')) return true;

    return false;
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
        // Use a 1-day lookback window for safety (avoids processing years of old mail)
        const dateStr = moment().tz(TZ).subtract(1, 'days').format('DD-MMM-YYYY');
        const searchCriteria = ['UNSEEN', ['SINCE', dateStr]];
        const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: false };

        const messages = await connection.search(searchCriteria, fetchOptions);

        // Fixed: The search criteria must be an array of arrays when providing arguments like 'SINCE'.
        const todayStr = moment().tz(TZ).format('DD-MMM-YYYY');
        const fallbackCriteria = [['SINCE', todayStr]];
        const allRecent = await connection.search(fallbackCriteria, fetchOptions);
        
        const pool = connectDB();

        for (const m of allRecent) {
            // Priority: Skip if we already found this message in the UNSEEN search
            if (messages.some(existing => existing.attributes.uid === m.attributes.uid)) continue;

            try {
                const headerPart = m.parts.find(p => p.which === 'HEADER');
                if (!headerPart) continue;

                const msgIdArr = headerPart.body['message-id'];
                const msgId = Array.isArray(msgIdArr) && msgIdArr[0] 
                              ? msgIdArr[0].replace(/[<>]/g, '').trim() 
                              : null;

                if (!msgId) continue;
                
                // --- IDEMPOTENCY GATE ---
                // We check the DB to ensure this specific Message-ID hasn't been handled yet.
                const [exists] = await pool.query('SELECT id FROM email_logs WHERE message_id = ? LIMIT 1', [msgId]);
                if (!exists.length) {
                    const [existsInMsgs] = await pool.query('SELECT id FROM conversation_messages WHERE message_id = ? LIMIT 1', [msgId]);
                    if (!existsInMsgs.length) {
                        messages.push(m);
                    }
                }
            } catch (pErr) {
                logger.warn(`[EmailPoller] Fallback deduplication failed for UID ${m.attributes.uid}: ${pErr.message}`);
            }
        }

        if (messages.length > 0) {
            logger.info(`[EmailPoller] Found ${messages.length} email(s) to process.`);
        } else {
            isProcessing = false;
            return;
        }

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

    let parsed;
    try {
        parsed = await simpleParser(Buffer.from(allPart.body));
    } catch (parseErr) {
        logger.error(`[EmailPoller] Failed to parse email body: ${parseErr.message}`);
        return;
    }

    const messageId = parsed.messageId;
    if (!messageId) {
        logger.warn(`[EmailPoller] Email has no Message-ID header — skipping to prevent DB errors.`);
        return;
    }

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
    const isAutomated = isAutoReply(parsed);

    if (isAutomated) {
        logger.info(`[EmailPoller] 🤖 Automated response detected from ${senderEmail} (Subject: ${rawSubject}). Notifications will be suppressed.`);
    }

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

    // Standardize Participants (To+CC+BCC)
    const rawTo = parseAddressEmails(parsed.to);
    const rawCc = parseAddressEmails(parsed.cc);
    const rawBcc = parseAddressEmails(parsed.bcc);
    const participantList = filterParticipants([...new Set([...rawTo, ...rawCc, ...rawBcc])], senderEmail);

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
        const [doubleCheck] = await conn.query(`SELECT id FROM conversation_messages WHERE message_id = ?`, [messageId]);
        if (doubleCheck.length) return;

        // 2. Insert Message with headers
        const [msgResult] = await conn.query(
            `INSERT INTO conversation_messages 
             (conversation_id, sender_type, sender_name, message_body, message_id, in_reply_to, reference_chain)
             VALUES (?, 'customer', ?, ?, ?, ?, ?)`,
            [conversationId, senderName, bodyText, messageId, inReplyTo, references.join(' ')]
        );

        // 3. Map Participants (relational)
        const participants = [...rawTo, ...rawCc, ...rawBcc];
        const uniqueParticipants = [...new Set(filterParticipants(participants, senderEmail))];
        for (const email of uniqueParticipants) {
            const normalized = email.toLowerCase().trim();
            const [removals] = await conn.query(
                "SELECT id FROM conversation_participant_removals WHERE conversation_id = ? AND email = ? LIMIT 1",
                [conversationId, normalized]
            );
            if (!removals.length) {
                await conn.query(
                    `INSERT IGNORE INTO conversation_participants (conversation_id, email, type) VALUES (?, ?, 'cc')`,
                    [conversationId, normalized]
                );
            }
        }

        // 4. Activity Log
        await conn.query(
            `INSERT INTO ticket_activities (ticket_id, action, note) VALUES (?, 'comment', ?)`,
            [ticketId, `Email reply from ${senderEmail}`]
        );

        // 5. Broadcast real-time message + ticket update (ONLY if NOT automated)
        try {
            if (!isAutomated) {
                const { broadcast } = await import('./socketService.js');
                broadcast('new_message', {
                    id: msgResult.insertId,
                    ticket_id: ticketId,
                    conversation_id: conversationId,
                    sender_type: 'customer',
                    sender_name: senderName,
                    message_body: bodyText,
                    created_at: new Date().toISOString()
                });

                // Notify UI that this ticket was updated (for list refreshes)
                broadcast('ticket_updated', {
                    ticket_id: ticketId,
                    action: 'reply_received'
                });
            }
        } catch (sErr) {
            logger.error(`[EmailPoller] Socket broadcast failed for reply: ${sErr.message}`);
        }

        // 6. Notify Participants (ONLY if NOT automated)
        try {
            if (!isAutomated) {
                const [tRows] = await conn.query('SELECT id, ticket_number, category, priority FROM tickets WHERE id = ?', [ticketId]);
                if (tRows.length) {
                    await sendParticipantReplyNotification(tRows[0], senderEmail, bodyText);
                }
            } else {
                logger.debug(`[EmailPoller] Suppressing participant notification for automated reply to ${ticketNumber}`);
            }
        } catch (err) {
            logger.error(`[EmailPoller] Sync notification failed: ${err.message}`);
        }

        if (logId) await conn.query(`UPDATE email_logs SET status='processed' WHERE id=?`, [logId]);
        logger.info(`[EmailPoller] ✅ Threaded reply to ${ticketNumber}`);
    };

    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        let matchedTicketId = null;
        let matchedConvId = null;
        let matchedNum = null;

        // --- STEP 1: Strict Header Matching (Thread IDs) ---
        if (inReplyTo) {
            const [msgMatch] = await conn.query(
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
            // Optimized: Search all references in a single query instead of a loop
            const [refMatch] = await conn.query(
                `SELECT c.id as conv_id, c.ticket_id, t.ticket_number 
                 FROM conversation_messages cm
                 JOIN conversations c ON cm.conversation_id = c.id
                 JOIN tickets t ON c.ticket_id = t.id
                 WHERE cm.message_id IN (?) 
                 ORDER BY cm.created_at DESC LIMIT 1`,
                [references]
            );
            if (refMatch.length) {
                matchedConvId = refMatch[0].conv_id;
                matchedTicketId = refMatch[0].ticket_id;
                matchedNum = refMatch[0].ticket_number;
                logger.debug(`[EmailPoller] Header Match (References): ${matchedNum}`);
            }
        }

        // --- STEP 2: Subject Pattern Match (TKT Number) ---
        if (!matchedTicketId) {
            const ticketNumberMatch = rawSubject.match(/(TKT-\d{8}-\d{4})/i);
            if (ticketNumberMatch) {
                const tktNum = ticketNumberMatch[1].toUpperCase();
                const [tktRows] = await conn.query(
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
            const [pMatches] = await conn.query(
                `SELECT cp.conversation_id, c.ticket_id, t.ticket_number, t.subject 
                 FROM conversation_participants cp
                 JOIN conversations c ON cp.conversation_id = c.id
                 JOIN tickets t ON c.ticket_id = t.id
                 WHERE cp.email = ? AND t.status NOT IN ('resolved', 'closed')`,
                [senderEmail]
            );

            if (pMatches.length > 0) {
                // If there's only one active ticket, we match it ONLY if the subject is similar or it's a generic thread
                for (const match of pMatches) {
                    const existingSubject = (match.subject || '').replace(/^(re|fwd?|reply):\s*/i, '').trim().toLowerCase();
                    const incomingSubject = cleanSubject.toLowerCase();

                    // If subjects match (ignoring Re: prefixes) OR if the incoming mail is clearly a reply to SOMETHING
                    if (existingSubject === incomingSubject || rawSubject.toLowerCase().match(/^(re|fwd|reply):/)) {
                        matchedConvId = match.conversation_id;
                        matchedTicketId = match.ticket_id;
                        matchedNum = match.ticket_number;
                        logger.info(`[EmailPoller] 🛡️ Participant Fallback Match: ${matchedNum}`);
                        break;
                    }
                }
            }
        }

        // --- STEP 4: Attach or Create ---
        if (matchedTicketId && matchedConvId) {
            await appendReply(matchedTicketId, matchedConvId, matchedNum);
            await conn.commit();
            return;
        }

        // Create New Ticket
        let [customers] = await conn.query('SELECT id FROM customers WHERE email = ? LIMIT 1', [senderEmail]);
        let customerId;
        if (customers.length) {
            customerId = customers[0].id;
        } else {
            const [res] = await conn.query('INSERT INTO customers (name, email) VALUES (?, ?)', [senderName, senderEmail]);
            customerId = res.insertId;
        }

        const today = moment().tz(TZ).format('YYYYMMDD');
        const lockName = `ticket_seq_${today}`;
        await conn.query(`SELECT GET_LOCK(?, 5)`, [lockName]);
        let ticketNumber;
        try {
            const [countRow] = await conn.query(`SELECT COUNT(*) as cnt FROM tickets WHERE DATE(created_at) = CURDATE()`);
            const seq = String(countRow[0].cnt + 1).padStart(4, '0');
            ticketNumber = `TKT-${today}-${seq}`;
        } finally {
            await conn.query(`SELECT RELEASE_LOCK(?)`, [lockName]);
        }

        const nowStr = moment().tz(TZ).format('YYYY-MM-DD HH:mm:ss');
        let finalPriority = defaultPriority;
        const emergencyKeywords = ['server down', 'emergency', 'outage', 'critical', 'urgent', 'crashed'];
        if (emergencyKeywords.some(kw => rawSubject.toLowerCase().includes(kw) || bodyText.toLowerCase().includes(kw))) finalPriority = 'P1';

        const [policies] = await conn.query('SELECT resolution_time_hours FROM sla_policies WHERE priority = ?', [finalPriority]);
        const etr = moment().tz(TZ).add(policies[0]?.resolution_time_hours || 2, 'hours').format('YYYY-MM-DD HH:mm:ss');
        let finalAssigneeId = null;
        try {
            finalAssigneeId = await getShiftAssignee(finalPriority);
        } catch (assignErr) {
            logger.error(`[EmailPoller] Auto-assignment failed (non-fatal): ${assignErr.message}`);
        }

        const [tResult] = await conn.query(
            `INSERT INTO tickets (ticket_number, subject, customer_id, project_id, category, priority, description, status, escalation_level, sla_state, str, etr, created_by, assigned_to, source)
             VALUES (?,?,?,?,?,?,?, 'open', 1, 'active', ?, ?, ?, ?, 'email')`,
            [ticketNumber, rawSubject.slice(0, 500), customerId, defaultProjectId, cleanSubject.slice(0, 250), finalPriority, description, nowStr, etr, systemUserId, finalAssigneeId]
        );
        const ticketId = tResult.insertId;

        const [cvResult] = await conn.query(
            `INSERT INTO conversations (ticket_id, source_channel, root_message_id, customer_id) VALUES (?,?,?,?)`,
            [ticketId, 'email', messageId, customerId]
        );
        const conversationId = cvResult.insertId;

        const [msgResult] = await conn.query(
            `INSERT INTO conversation_messages (conversation_id, sender_type, sender_name, message_body, message_id, reference_chain)
             VALUES (?, 'customer', ?, ?, ?, ?)`,
            [conversationId, senderName, bodyText, messageId, references.join(' ')]
        );

        // Add Participants (To + CC + BCC)
        await conn.query(`INSERT INTO conversation_participants (conversation_id, email, type) VALUES (?, ?, 'to')`, [conversationId, senderEmail]);
        
        const participants = [...rawTo, ...rawCc, ...rawBcc];
        const uniqueParticipants = [...new Set(filterParticipants(participants, senderEmail))];
        for (const email of uniqueParticipants) {
            const normalized = email.toLowerCase().trim();
            // Even for new tickets, check if they were EVER removed from this conversation (unlikely but safe)
            const [removals] = await conn.query(
                "SELECT id FROM conversation_participant_removals WHERE conversation_id = ? AND email = ? LIMIT 1",
                [conversationId, normalized]
            );
            if (!removals.length) {
                await conn.query(
                    `INSERT IGNORE INTO conversation_participants (conversation_id, email, type) VALUES (?, ?, 'cc')`,
                    [conversationId, normalized]
                );
            }
        }

        await conn.query('INSERT INTO ticket_activities (ticket_id, action, note) VALUES (?, "created", ?)', [ticketId, `Auto-created from email: ${senderEmail}`]);

        await conn.commit();

        // Mark as processed IMMEDIATELY after commit — before external calls that may fail
        if (logId) await conn.query(`UPDATE email_logs SET status='processed' WHERE id=?`, [logId]);
        logger.info(`[EmailPoller] 🆕 Created ticket ${ticketNumber}`);

        // 6. Real-time Broadcasts (Ticket + Initial Message)
        try {
            if (!isAutomated) {
                const { broadcast } = await import('./socketService.js');
                
                // Broadcast the new ticket itself
                broadcast('new_ticket', {
                    id: ticketId,
                    ticket_number: ticketNumber,
                    category: cleanSubject.slice(0, 250),
                    priority: finalPriority,
                    status: 'open',
                    customer_name: customers[0]?.name || senderName,
                    created_at: nowStr
                });

                // Broadcast the initial message
                broadcast('new_message', {
                    id: msgResult.insertId,
                    ticket_id: ticketId,
                    conversation_id: conversationId,
                    sender_type: 'customer',
                    sender_name: senderName,
                    message_body: bodyText,
                    created_at: nowStr
                });
            }
        } catch (sErr) {
            logger.error(`[EmailPoller] Socket broadcast failed for new ticket: ${sErr.message}`);
        }

        // Notifications (ONLY if NOT automated) — all wrapped in try/catch since DB is already committed
        const ticketObj = { id: ticketId, ticket_number: ticketNumber, category: cleanSubject.slice(0, 250), priority: finalPriority, description: description, etr: etr };
        try { 
            if (!isAutomated) {
                await sendTicketNotification(ticketObj, senderEmail, messageId); 
            } else {
                logger.info(`[EmailPoller] Suppressing initial acknowledgement for automated new ticket ${ticketNumber}`);
            }
        } catch (_) {}
        if (finalPriority === 'P1') try { await sendEmergencyBroadcast({ id: ticketId, ...ticketObj }); } catch (_) {}
        if (finalAssigneeId) {
            try {
                await createNotification(pool, {
                    user_id: finalAssigneeId,
                    type: 'ticket_assigned',
                    title: `Auto-Assigned: ${ticketNumber}`,
                    body: `You have been auto-assigned a new email ticket: ${cleanSubject}`,
                    entity_id: ticketId
                });
            } catch (notifErr) {
                logger.error(`[EmailPoller] In-app notification failed (non-fatal): ${notifErr.message}`);
            }
        }

    } catch (err) {
        // Safe rollback — conn itself might be broken (e.g. DB disconnected)
        try { if (conn) await conn.rollback(); } catch (rbErr) {
            logger.error(`[EmailPoller] Rollback failed: ${rbErr.message}`);
        }
        // Safe status update — use pool (not conn) since conn may be broken
        try {
            if (logId) await pool.query(`UPDATE email_logs SET status='failed', error_message=? WHERE id=?`, [err.message?.slice(0, 500), logId]);
        } catch (logErr) {
            logger.error(`[EmailPoller] Failed to update email_log: ${logErr.message}`);
        }
        throw err;
    } finally {
        try { if (conn) conn.release(); } catch (_) {}
    }
}

export async function startEmailPoller() {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = (process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASSWORD)?.trim();
    if (!gmailUser || !gmailPass) {
        logger.error('[EmailPoller] Missing GMAIL_USER or GMAIL_APP_PASSWORD in environment.');
        return;
    }

    const config = {
        imap: { user: gmailUser, password: gmailPass, host: 'imap.gmail.com', port: 993, tls: true, tlsOptions: { rejectUnauthorized: false }, authTimeout: 15000 },
        onmail: function () {
            if (activeConnection) {
                logger.debug('[EmailPoller] New mail event triggered.');
                processEmails(activeConnection).catch(e => logger.error(`[EmailPoller] onMail process error: ${e.message}`));
            }
        }
    };

    try {
        // Cleanup existing connection if any
        if (activeConnection) {
            try { 
                activeConnection.end(); 
                activeConnection.imap.removeAllListeners();
            } catch (_) {}
            activeConnection = null;
        }

        logger.info(`[EmailPoller] 📡 Attempting IMAP connection to ${gmailUser}... (Attempt ${reconnectAttempts + 1})`);
        activeConnection = await imapSimple.connect(config);
        
        // Reset state on success
        reconnectAttempts = 0;
        await activeConnection.openBox('INBOX');
        logger.info(`[EmailPoller] ✅ IMAP connected and INBOX opened for ${gmailUser}`);

        // Initialize Cron only ONCE in the lifetime of the process
        if (!isCronInitialized) {
            cron.schedule('*/1 * * * *', () => {
                if (activeConnection && !isProcessing) {
                    processEmails(activeConnection).catch(e => logger.error(`[EmailPoller] Cron process error: ${e.message}`));
                }
            });
            isCronInitialized = true;
            logger.info('[EmailPoller] ⏰ Scheduled 1-minute recurring sync.');
        }

        // Immediate first scan
        processEmails(activeConnection).catch(e => logger.error(`[EmailPoller] Initial scan error: ${e.message}`));

        // Persistent Event Handlers
        activeConnection.imap.on('close', () => {
            logger.warn('[EmailPoller] 🔌 IMAP connection closed. Reconnecting...');
            handleReconnection();
        });

        activeConnection.imap.on('error', (err) => {
            logger.error(`[EmailPoller] ❌ IMAP error: ${err.message}`);
            handleReconnection();
        });

    } catch (err) {
        logger.error(`[EmailPoller] ❌ IMAP connection failed: ${err.message}`);
        handleReconnection();
    }
}

function handleReconnection() {
    if (activeConnection) {
        try { activeConnection.end(); } catch (_) {}
        activeConnection = null;
    }

    reconnectAttempts++;
    if (reconnectAttempts > MAX_ATTEMPTS) {
        logger.error('[EmailPoller] 🛑 Max reconnection attempts reached. Poller stopped.');
        return;
    }

    // Exponential Backoff: 5s, 10s, 20s, 40s... capped at 5min
    const delay = Math.min(BACKOFF_BASE * Math.pow(2, reconnectAttempts - 1), MAX_BACKOFF);
    logger.warn(`[EmailPoller] ⏳ Reconnecting in ${delay / 1000}s...`);
    setTimeout(startEmailPoller, delay);
}

