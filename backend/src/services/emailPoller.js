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
let pendingProcess = false;
let lastProcessStart = 0;
let reconnectAttempts = 0;
let isCronInitialized = false;

// Reconnection Constants
const BACKOFF_BASE = 5000;  // 5 seconds
const MAX_BACKOFF = 300000; // 5 minutes (300s)
const MAX_ATTEMPTS = 50;    // Absolute ceiling for safety
const MAX_MESSAGES_PER_CYCLE = parseInt(process.env.EMAIL_POLLER_BATCH_SIZE || '25', 10);
const EMAIL_POLLER_CRON = process.env.EMAIL_POLLER_CRON || '*/15 * * * * *';
const PARTICIPANT_FALLBACK_WINDOW_HOURS = Math.max(1, parseInt(process.env.EMAIL_FALLBACK_WINDOW_HOURS || '720', 10));
const STRICT_SUBJECT_PARTICIPANT_MATCH = String(process.env.STRICT_SUBJECT_PARTICIPANT_MATCH || 'false').toLowerCase() === 'true';
const POLLER_START_TS = Date.now();
const POLLER_START_IMAP_DATE = moment(POLLER_START_TS).tz(TZ).format('DD-MMM-YYYY');

function stripHtml(html = '') {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeEmail(raw = '') {
    const match = raw.match(/<(.+?)>/);
    return (match ? match[1] : raw).trim().toLowerCase();
}

function normalizeMessageId(raw = '') {
    return String(raw || '').replace(/[<>]/g, '').trim();
}

function messageIdVariants(raw = '') {
    const clean = normalizeMessageId(raw);
    if (!clean) return [];
    return [clean, `<${clean}>`];
}

function normalizeMessageIdList(rawRefs) {
    const refs = Array.isArray(rawRefs) ? rawRefs : (rawRefs ? [rawRefs] : []);
    return [...new Set(refs.map(normalizeMessageId).filter(Boolean))];
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

    if (isProcessing) {
        pendingProcess = true;
        logger.info('[EmailPoller] Scan requested while busy. Queued next scan.');
        return;
    }

    isProcessing = true;
    lastProcessStart = now;

    const pool = connectDB();
    let lockAcquired = false;
    let lockConn = null;

    try {
        const cycleStart = Date.now();
        logger.info('[EmailPoller] Scan cycle started.');
        // --- GLOBAL LOCK ---
        // Prevents multiple PM2 processes from racing. Timeout 0 = return immediately if locked.
        lockConn = await pool.getConnection();
        const [lockResult] = await lockConn.query("SELECT GET_LOCK('email_poller_lock', 0) AS lockStatus");
        if (lockResult[0].lockStatus !== 1) {
            logger.info('[EmailPoller] Global lock busy. Another worker is processing emails.');
            isProcessing = false;
            return;
        }
        lockAcquired = true;
        // Strict startup window: only process mails from when this server process started.
        const searchCriteria = ['UNSEEN', ['SINCE', POLLER_START_IMAP_DATE]];
        const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: false };

        let messages = await connection.search(searchCriteria, fetchOptions);
        const rawCount = messages.length;

        // IMAP SINCE is day-granularity, so enforce exact startup timestamp in-memory.
        const startupFiltered = messages.filter(m => {
            const d = m.attributes?.date ? new Date(m.attributes.date).getTime() : NaN;
            if (Number.isNaN(d)) return true; // keep if provider omitted internal date
            return d >= POLLER_START_TS;
        });
        const droppedBacklog = messages.length - startupFiltered.length;
        messages = startupFiltered;

        if (messages.length > 0) {
            // Prioritize newest messages first and cap per-cycle batch size.
            messages = messages
                .sort((a, b) => (b.attributes?.uid || 0) - (a.attributes?.uid || 0))
                .slice(0, Math.max(1, MAX_MESSAGES_PER_CYCLE));
            logger.info(`[EmailPoller] Search returned ${rawCount}. Processing ${messages.length}.${droppedBacklog > 0 ? ` Skipped ${droppedBacklog} pre-start message(s).` : ''}`);
        } else {
            isProcessing = false;
            logger.info(`[EmailPoller] No eligible unread emails in this cycle (search returned ${rawCount}).`);
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
        logger.info(`[EmailPoller] Cycle completed in ${Date.now() - cycleStart}ms`);
    } catch (err) {
        logger.error(`[EmailPoller] Search error: ${err.message}`);
    } finally {
        if (lockAcquired && lockConn) {
            try {
                await lockConn.query("SELECT RELEASE_LOCK('email_poller_lock')");
            } catch (releaseErr) {
                logger.error(`[EmailPoller] Failed to release global lock: ${releaseErr.message}`);
            }
        }
        if (lockConn) {
            try { lockConn.release(); } catch (_) {}
        }
        isProcessing = false;
        if (pendingProcess) {
            pendingProcess = false;
            logger.info('[EmailPoller] Running queued scan now.');
            setTimeout(() => {
                processEmails(connection).catch(e => logger.error(`[EmailPoller] Queued scan error: ${e.message}`));
            }, 200);
        }
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

    const messageId = normalizeMessageId(parsed.messageId);
    if (!messageId) {
        logger.warn(`[EmailPoller] Email has no Message-ID header — skipping to prevent DB errors.`);
        return;
    }

    const inReplyTo = normalizeMessageId(parsed.inReplyTo);
    const references = normalizeMessageIdList(parsed.references);
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
        logger.info(`[EmailPoller] ℹ️ Skipping message already in logs (${existingLog[0].status}): ${messageId}`);
        return;
    }

    const [existingMsg] = await pool.query(
        `SELECT id FROM conversation_messages WHERE message_id IN (?) LIMIT 1`,
        [messageIdVariants(messageId)]
    );
    if (existingMsg.length) {
        logger.info(`[EmailPoller] ℹ️ Skipping duplicate message in DB: ${messageId}`);
        return;
    }

    // Standardize Participants (To+CC only; never promote BCC into outbound participant graph)
    const rawTo = parseAddressEmails(parsed.to);
    const rawCc = parseAddressEmails(parsed.cc);
    const visibleParticipants = [...new Set([...rawTo, ...rawCc])];

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
        const [doubleCheck] = await conn.query(
            `SELECT id FROM conversation_messages WHERE message_id IN (?)`,
            [messageIdVariants(messageId)]
        );
        if (doubleCheck.length) return;

        // 2. Insert Message with headers
        const [msgResult] = await conn.query(
            `INSERT INTO conversation_messages 
             (conversation_id, sender_type, sender_name, message_body, message_id, in_reply_to, reference_chain)
             VALUES (?, 'customer', ?, ?, ?, ?, ?)`,
            [conversationId, senderName, bodyText, messageId, inReplyTo, references.join(' ')]
        );

        // 3. Map Participants (relational)
        const uniqueParticipants = [...new Set(filterParticipants(visibleParticipants, senderEmail))];
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
                    sendParticipantReplyNotification(tRows[0], senderEmail, bodyText)
                        .catch(err => logger.error(`[EmailPoller] Async participant notification failed: ${err.message}`));
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
        let matchReason = 'none';

        // --- STEP 1: Strict Header Matching (Thread IDs) ---
        if (inReplyTo) {
            const inReplyToCandidates = messageIdVariants(inReplyTo);
            const [msgMatch] = await conn.query(
                `SELECT c.id as conv_id, c.ticket_id, t.ticket_number 
                 FROM conversation_messages cm
                 JOIN conversations c ON cm.conversation_id = c.id
                 JOIN tickets t ON c.ticket_id = t.id
                 WHERE cm.message_id IN (?) LIMIT 1`,
                [inReplyToCandidates]
            );
            if (msgMatch.length) {
                matchedConvId = msgMatch[0].conv_id;
                matchedTicketId = msgMatch[0].ticket_id;
                matchedNum = msgMatch[0].ticket_number;
                matchReason = 'header_in_reply_to';
                logger.debug(`[EmailPoller] Header Match (In-Reply-To): ${matchedNum}`);
            }
        }

        if (!matchedTicketId && references.length > 0) {
            const refCandidates = [...new Set(references.flatMap(ref => messageIdVariants(ref)))];
            if (refCandidates.length > 0) {
                // Optimized: Search all references in a single query instead of a loop
                const [refMatch] = await conn.query(
                    `SELECT c.id as conv_id, c.ticket_id, t.ticket_number 
                     FROM conversation_messages cm
                     JOIN conversations c ON cm.conversation_id = c.id
                     JOIN tickets t ON c.ticket_id = t.id
                     WHERE cm.message_id IN (?) 
                     ORDER BY cm.created_at DESC LIMIT 1`,
                    [refCandidates]
                );
                if (refMatch.length) {
                    matchedConvId = refMatch[0].conv_id;
                    matchedTicketId = refMatch[0].ticket_id;
                    matchedNum = refMatch[0].ticket_number;
                    matchReason = 'header_references';
                    logger.debug(`[EmailPoller] Header Match (References): ${matchedNum}`);
                }
            }
        }

        // --- STEP 2: Subject Pattern Match (TKT Number) ---
        if (!matchedTicketId) {
            const ticketNumberMatch = rawSubject.match(/(TKT-\d{8}-\d{4})/i);
            if (ticketNumberMatch) {
                const tktNum = ticketNumberMatch[1].toUpperCase();
                const [tktRows] = STRICT_SUBJECT_PARTICIPANT_MATCH
                    ? await conn.query(
                        `SELECT t.id, c.id as conv_id
                         FROM tickets t
                         LEFT JOIN customers cu ON cu.id = t.customer_id
                         LEFT JOIN conversations c ON c.ticket_id = t.id
                         WHERE t.ticket_number = ?
                           AND (
                             LOWER(COALESCE(cu.email, '')) = LOWER(?)
                             OR EXISTS (
                               SELECT 1
                               FROM conversation_participants cp
                               WHERE cp.conversation_id = c.id AND LOWER(cp.email) = LOWER(?)
                             )
                           )
                         LIMIT 1`,
                        [tktNum, senderEmail, senderEmail]
                    )
                    : await conn.query(
                        `SELECT t.id, c.id as conv_id
                         FROM tickets t
                         LEFT JOIN conversations c ON c.ticket_id = t.id
                         WHERE t.ticket_number = ? LIMIT 1`,
                        [tktNum]
                    );
                if (tktRows.length) {
                    matchedTicketId = tktRows[0].id;
                    matchedConvId = tktRows[0].conv_id;
                    matchedNum = tktNum;
                    matchReason = 'subject_ticket_number';
                    logger.debug(`[EmailPoller] Subject Pattern Match: ${matchedNum}`);
                } else if (STRICT_SUBJECT_PARTICIPANT_MATCH) {
                    logger.info(`[EmailPoller] Ticket-number subject found (${tktNum}) but sender ${senderEmail} is not a participant/customer. Creating new ticket.`);
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
                 WHERE cp.email = ?
                   AND t.status NOT IN ('resolved', 'closed')
                   AND t.updated_at >= DATE_SUB(NOW(), INTERVAL ${PARTICIPANT_FALLBACK_WINDOW_HOURS} HOUR)`,
                [senderEmail]
            );

            if (pMatches.length > 0) {
                // If there's more than one active ticket, find the best match by subject similarity
                let bestMatch = null;
                
                for (const match of pMatches) {
                    const existingSubject = (match.subject || '').replace(/^(re|fwd?|reply):\s*/i, '').trim().toLowerCase();
                    const incomingSubject = cleanSubject.toLowerCase();

                    // Priority 1: Exact Subject Match (after cleaning)
                    if (existingSubject === incomingSubject) {
                        bestMatch = match;
                        logger.debug(`[EmailPoller] 🛡️ Exact Subject Fallback: ${match.ticket_number}`);
                        break; 
                    }
                    
                    // Priority 2: If it's a generic "Re:" reply, we only match if no better match found yet
                    if (rawSubject.toLowerCase().match(/^(re|fwd|reply):/) && !bestMatch) {
                        bestMatch = match;
                        logger.debug(`[EmailPoller] 🛡️ Partial/Thread Fallback (First found): ${match.ticket_number}`);
                    }
                }

                if (bestMatch) {
                    matchedConvId = bestMatch.conversation_id;
                    matchedTicketId = bestMatch.ticket_id;
                    matchedNum = bestMatch.ticket_number;
                    matchReason = 'participant_fallback';
                    logger.info(`[EmailPoller] 🛡️ Participant Fallback Match: ${matchedNum}`);
                }
            }
        }

        // --- STEP 4: Attach or Create ---
        if (matchedTicketId && matchedConvId) {
            logger.info(`[EmailPoller] Match result: reason=${matchReason} messageId=${messageId} inReplyTo=${inReplyTo || ''} ticket=${matchedNum}`);
            await appendReply(matchedTicketId, matchedConvId, matchedNum);
            await conn.commit();
            return;
        }

        // Create New Ticket
        logger.info(`[EmailPoller] Match result: reason=new_ticket messageId=${messageId} inReplyTo=${inReplyTo || ''}`);
        logger.info(`[EmailPoller] No thread match for ${messageId}. Creating new ticket from sender=${senderEmail}, subject="${rawSubject.slice(0, 120)}"`);
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
        
        const uniqueParticipants = [...new Set(filterParticipants(visibleParticipants, senderEmail))];
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
                sendTicketNotification(ticketObj, senderEmail, messageId)
                    .catch(err => logger.error(`[EmailPoller] Async initial acknowledgement failed: ${err.message}`));
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
    const smtpUser = (process.env.EMAIL_USER || '').trim().toLowerCase();
    const pollerUser = (gmailUser || '').trim().toLowerCase();
    if (!gmailUser || !gmailPass) {
        logger.error('[EmailPoller] Missing GMAIL_USER or GMAIL_APP_PASSWORD in environment.');
        return;
    }
    if (smtpUser && pollerUser && smtpUser !== pollerUser) {
        logger.warn(`[EmailPoller] SMTP sender (${smtpUser}) differs from polled inbox (${pollerUser}). Ensure outgoing emails set Reply-To to ${pollerUser}.`);
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

        // Real-time trigger: process immediately when server receives new mail notifications.
        activeConnection.imap.on('mail', (numNewMsgs) => {
            logger.info(`[EmailPoller] New mail event received (${numNewMsgs || 0}). Triggering immediate scan.`);
            processEmails(activeConnection).catch(e => logger.error(`[EmailPoller] Mail-event process error: ${e.message}`));
        });

        // Initialize Cron only ONCE in the lifetime of the process
        if (!isCronInitialized) {
            cron.schedule(EMAIL_POLLER_CRON, () => {
                if (activeConnection && !isProcessing) {
                    processEmails(activeConnection).catch(e => logger.error(`[EmailPoller] Cron process error: ${e.message}`));
                }
            });
            isCronInitialized = true;
            logger.info(`[EmailPoller] ⏰ Scheduled recurring sync with cron: ${EMAIL_POLLER_CRON}`);
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
