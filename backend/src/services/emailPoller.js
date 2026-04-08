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
    const fromRaw = parsed.from?.text || '';
    const senderEmail = normalizeEmail(fromRaw);
    const senderName = parsed.from?.value?.[0]?.name || senderEmail;

    if (!senderEmail || senderEmail === SUPPORT_EMAIL || senderEmail === GMAIL_POLLER_EMAIL) {
        return;
    }

    const subject = (parsed.subject || 'No Subject').trim().slice(0, 200);
    const cleanSubject = subject
        .replace(/^(re|fwd?|reply):\s*/i, '')
        .replace(/\[?TKT-\d{8}-\d{4}\]?\s*/gi, '')
        .trim() || 'General Inquiry';

    const bodyText = parsed.text ? parsed.text.trim() : (parsed.html ? stripHtml(parsed.html) : '');
    const description = bodyText.slice(0, 5000) || subject;

    // Collect ALL participants except support and sender
    const rawTo = parseAddressEmails(parsed.to);
    const rawCc = parseAddressEmails(parsed.cc);
    const participantList = filterParticipants([...new Set([...rawTo, ...rawCc])], senderEmail);

    const appendReply = async (ticketId, ticketNumber) => {
        let [convos] = await pool.query(
            'SELECT id FROM conversations WHERE ticket_id = ? AND source_channel = ? LIMIT 1',
            [ticketId, 'email']
        );

        let conversationId;
        if (convos.length) {
            conversationId = convos[0].id;
            // Update participant list if new people reached out
            if (participantList.length > 0) {
                const [existing] = await pool.query('SELECT cc_emails FROM conversations WHERE id = ?', [conversationId]);
                const existingCCs = existing[0]?.cc_emails ? existing[0].cc_emails.split(',') : [];
                const merged = [...new Set([...existingCCs, ...participantList])].filter(Boolean);
                await pool.query('UPDATE conversations SET cc_emails = ? WHERE id = ?', [merged.join(','), conversationId]);
            }
        } else {
            const [newConvo] = await pool.query(
                'INSERT INTO conversations (ticket_id, source_channel, participant_identity, cc_emails) VALUES (?,?,?,?)',
                [ticketId, 'email', senderEmail, participantList.join(',') || null]
            );
            conversationId = newConvo.insertId;
        }

        const [existing] = await pool.query(
            `SELECT id FROM conversation_messages 
             WHERE conversation_id = ? AND message_body = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE) LIMIT 1`,
            [conversationId, bodyText]
        );
        if (existing.length) return;

        const [msgResult] = await pool.query(
            `INSERT INTO conversation_messages (conversation_id, sender_type, sender_id, sender_name, message_body, created_at)
             VALUES (?, 'customer', NULL, ?, ?, NOW())`,
            [conversationId, senderName, bodyText]
        );

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

        await pool.query(
            `INSERT INTO ticket_activities (ticket_id, action, note) VALUES (?, 'comment', ?)`,
            [ticketId, `Email reply from ${senderEmail}`]
        );

        // SYNC TRIGGER: Notify all other participants (Primary + CCs) about this reply
        // This ensures the "Email Trail" is appended for everyone else's inbox.
        try {
            const [tRows] = await pool.query('SELECT id, ticket_number, category, priority FROM tickets WHERE id = ?', [ticketId]);
            if (tRows.length) {
                await sendParticipantReplyNotification(tRows[0], senderEmail, bodyText);
            }
        } catch (err) {
            logger.error(`[EmailPoller] Sync notification failed: ${err.message}`);
        }

        logger.info(`[EmailPoller] ✅ Threaded reply to ${ticketNumber}`);
    };

    // 1. Subject pattern match
    const ticketNumberMatch = subject.match(/(TKT-\d{8}-\d{4})/i);
    if (ticketNumberMatch) {
        const matchedTicketNumber = ticketNumberMatch[1].toUpperCase();
        const [rows] = await pool.query('SELECT id FROM tickets WHERE ticket_number = ? LIMIT 1', [matchedTicketNumber]);
        if (rows.length) {
            await appendReply(rows[0].id, matchedTicketNumber);
            return;
        }
    }

    // 2. Header match
    const replyTo = parsed.inReplyTo || '';
    const refs = Array.isArray(parsed.references) ? parsed.references.join(' ') : (parsed.references || '');
    const headerMatch = `${replyTo} ${refs}`.match(/(TKT-\d{8}-\d{4})@ticketcrm\.local/i);
    if (headerMatch) {
        const matchedNum = headerMatch[1].toUpperCase();
        const [rows] = await pool.query('SELECT id FROM tickets WHERE ticket_number = ? LIMIT 1', [matchedNum]);
        if (rows.length) {
            await appendReply(rows[0].id, matchedNum);
            return;
        }
    }

    // 3. CC/Participant match (Subject-Aware)
    // We only thread by participant if the subject also matches.
    // This allows CC'd people to thread when replying, but new emails to be unique.
    if (senderEmail) {
        const [pMatch] = await pool.query(
            `SELECT t.id, t.ticket_number FROM conversations c
             JOIN tickets t ON c.ticket_id = t.id
             WHERE c.source_channel = 'email'
               AND t.status NOT IN ('closed', 'resolved')
               AND t.category = ?
               AND (
                   c.participant_identity = ? 
                   OR FIND_IN_SET(?, REPLACE(COALESCE(c.cc_emails, ''), ' ', '')) > 0
               )
             ORDER BY t.created_at DESC LIMIT 1`,
            [cleanSubject, senderEmail, senderEmail]
        );
        if (pMatch.length) {
            logger.info(`[EmailPoller] ✅ Participant + Subject match: ${senderEmail} → ${pMatch[0].ticket_number}`);
            await appendReply(pMatch[0].id, pMatch[0].ticket_number);
            return;
        }
    }

    // 4. Create new Ticket logic
    let [customers] = await pool.query('SELECT id FROM customers WHERE email = ? LIMIT 1', [senderEmail]);
    let customerId = customers.length ? customers[0].id : (await pool.query('INSERT INTO customers (name, email) VALUES (?, ?)', [senderName, senderEmail]))[0].insertId;

    const [openTickets] = await pool.query(
        `SELECT id, ticket_number FROM tickets WHERE customer_id = ? AND category = ? AND status NOT IN ('closed', 'resolved') ORDER BY created_at DESC LIMIT 1`,
        [customerId, cleanSubject]
    );
    if (openTickets.length) {
        await appendReply(openTickets[0].id, openTickets[0].ticket_number);
        return;
    }

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

    const nowStr = moment().tz(TZ).format('YYYY-MM-DD HH:mm:ss');
    let finalPriority = defaultPriority;
    const emergencyKeywords = ['server down', 'emergency', 'outage', 'critical', 'urgent', 'crashed'];
    if (emergencyKeywords.some(kw => subject.toLowerCase().includes(kw) || bodyText.toLowerCase().includes(kw))) finalPriority = 'P1';

    const [policies] = await pool.query('SELECT resolution_time_hours FROM sla_policies WHERE priority = ?', [finalPriority]);
    const etr = moment().tz(TZ).add(policies[0]?.resolution_time_hours || 2, 'hours').format('YYYY-MM-DD HH:mm:ss');

    const [result] = await pool.query(
        `INSERT INTO tickets (ticket_number, customer_id, project_id, category, priority, description, status, escalation_level, sla_state, str, etr, created_by, source)
         VALUES (?,?,?,?,?,?, 'open', 1, 'active', ?, ?, ?, 'email')`,
        [ticketNumber, customerId, defaultProjectId, cleanSubject, finalPriority, description, nowStr, etr, systemUserId]
    );
    const ticketId = result.insertId;

    await pool.query('INSERT INTO ticket_activities (ticket_id, action, note) VALUES (?, "created", ?)', [ticketId, `Auto-created from email: ${senderEmail}`]);
    const [cvResult] = await pool.query('INSERT INTO conversations (ticket_id, source_channel, participant_identity, cc_emails) VALUES (?,?,?,?)', [ticketId, 'email', senderEmail, participantList.join(',') || null]);
    const conversationId = cvResult.insertId;
    await pool.query('INSERT INTO conversation_messages (conversation_id, sender_type, sender_name, message_body, created_at) VALUES (?, "customer", ?, ?, NOW())', [conversationId, senderName, bodyText]);

    const ticketObj = { id: ticketId, ticket_number: ticketNumber, category: cleanSubject, priority: finalPriority, description: description, etr: etr };
    try { await sendTicketNotification(ticketObj, senderEmail); } catch (_) {}
    if (finalPriority === 'P1') try { await sendEmergencyBroadcast({ id: ticketId, ...ticketObj }); } catch (_) {}

    logger.info(`[EmailPoller] 🆕 Created ticket ${ticketNumber}`);
}

export async function startEmailPoller() {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD?.trim();
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
        cron.schedule('*/1 * * * *', () => { if (activeConnection && !isProcessing) processEmails(activeConnection); });
        processEmails(activeConnection);
        activeConnection.imap.on('close', () => setTimeout(startEmailPoller, 5000));
    } catch (err) {
        setTimeout(startEmailPoller, 10000);
    }
}
