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
import { resolveSlaPolicy, getSlaCalendar, generateTicketNumber, resolveTicketTimezone } from '../modules/sla/slaPolicyService.js';
import { SlaCalculator } from './sla/calculator.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { publishBroadcast } from './realtimeEvents.js';
import { PUBLIC_DOMAINS, extractDomainFromEmail, buildDomainCandidates } from '../utils/domainUtils.js';
import { emailQueue } from '../queues/emailQueue.js';
import { buildInboundEmailJobPayload } from './emailProcessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ATTACHMENT_DIR = path.resolve(__dirname, '../../public/attachments');

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
// Rolling 24-hour lookback window — recomputed each cycle so server restarts never cause missed emails.
// The DB (email_logs) handles all deduplication; this is just an IMAP bandwidth limit.
const POLLER_LOOKBACK_HOURS = parseInt(process.env.EMAIL_POLLER_LOOKBACK_HOURS || '24', 10);
const systemUserId = parseInt(process.env.EMAIL_SYSTEM_USER_ID || '5', 10); // Default System/Admin user ID for auto-created tickets
const EMAIL_CYCLE_WARN_MS = Math.max(5000, parseInt(process.env.EMAIL_POLLER_CYCLE_WARN_MS || '20000', 10));
const EMAIL_MESSAGE_WARN_MS = Math.max(1000, parseInt(process.env.EMAIL_POLLER_MESSAGE_WARN_MS || '8000', 10));
const EMAIL_POLLER_SEARCH_MODE = String(process.env.EMAIL_POLLER_SEARCH_MODE || 'unseen').toLowerCase();
const EMAIL_POLLER_CHECKPOINT_KEY = process.env.EMAIL_POLLER_CHECKPOINT_KEY || 'EMAIL_POLLER_LAST_UID';
let consecutiveLockBusyCount = 0;

const mailLogColors = {
    inbound: (text) => `\x1b[1;96m${text}\x1b[0m`,
};

function truncateForTable(value, max = 60) {
    const str = String(value || '');
    if (str.length <= max) return str;
    return `${str.slice(0, max - 3)}...`;
}

function printCycleTable(rows) {
    if (!rows?.length || typeof console.table !== 'function') return;
    try {
        console.table(rows);
    } catch (_) {}
}

async function getPollerCheckpoint(pool) {
    const [rows] = await pool.query(
        `SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1`,
        [EMAIL_POLLER_CHECKPOINT_KEY]
    );
    const value = parseInt(rows[0]?.setting_value || '0', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

async function setPollerCheckpoint(pool, uid) {
    const normalizedUid = parseInt(uid, 10);
    if (!Number.isFinite(normalizedUid) || normalizedUid <= 0) return;

    await pool.query(
        `INSERT INTO system_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [EMAIL_POLLER_CHECKPOINT_KEY, String(normalizedUid)]
    );
}

async function searchBootstrapMessages(connection, pollerSinceDate) {
    const searchCriteria = EMAIL_POLLER_SEARCH_MODE === 'all'
        ? ['ALL', ['SINCE', pollerSinceDate]]
        : ['UNSEEN', ['SINCE', pollerSinceDate]];
    const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: false };
    const messages = await connection.search(searchCriteria, fetchOptions);
    const searchLabel = EMAIL_POLLER_SEARCH_MODE === 'all' ? 'ALL' : 'UNSEEN';

    return { messages, searchLabel, mode: 'bootstrap' };
}

async function searchMessagesSinceCheckpoint(connection, lastSeenUid) {
    const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: false };
    const nextUid = Math.max(1, parseInt(lastSeenUid || 0, 10) + 1);
    const messages = await connection.search([['UID', `${nextUid}:*`]], fetchOptions);
    return { messages, searchLabel: `UID>${lastSeenUid}`, mode: 'checkpoint' };
}

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

/**
 * Handle extraction and secure storage of email attachments.
 */
async function saveEmailAttachments(pool, messageId, attachments) {
    if (!attachments || attachments.length === 0) return;

    try {
        const attParams = [];
        for (const att of attachments) {
            const originalName = att.filename || 'unnamed_attachment';
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const storageName = `att-${uniqueSuffix}${path.extname(originalName).toLowerCase() || ''}`;
            const storagePath = path.join(ATTACHMENT_DIR, storageName);

            // 1. Save buffer to disk
            fs.writeFileSync(storagePath, att.content);

            // 2. Prepare metadata
            attParams.push([
                messageId,
                1, // Default tenant_id
                originalName,
                storageName,
                att.contentType || 'application/octet-stream',
                att.size || 0,
                null, // Uploaded by system/email
                'public' // Customer emails are public by default
            ]);
        }

        if (attParams.length > 0) {
            await pool.query(
                `INSERT INTO conversation_message_attachments 
                 (message_id, tenant_id, original_name, storage_path, file_type, file_size, uploaded_by, visibility)
                 VALUES ?`,
                [attParams]
            );
            logger.info(`[EmailPoller] Saved ${attParams.length} attachment(s) for message index ${messageId}`);
        }
    } catch (err) {
        logger.error(`[EmailPoller] Error saving email attachments: ${err.message}`);
        // Not throwing - defensive ingestion
    }
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
            consecutiveLockBusyCount += 1;
            const busyLevel = consecutiveLockBusyCount >= 4 ? 'warn' : 'info';
            logger[busyLevel](
                `[EmailPoller] Global lock busy. Another worker is processing emails. consecutiveBusy=${consecutiveLockBusyCount}`
            );
            isProcessing = false;
            return;
        }
        consecutiveLockBusyCount = 0;
        lockAcquired = true;
        const pollerSinceTs = Date.now() - (POLLER_LOOKBACK_HOURS * 60 * 60 * 1000);
        const pollerSinceDate = moment(pollerSinceTs).tz(TZ).format('DD-MMM-YYYY');
        const lastSeenUid = await getPollerCheckpoint(pool);

        let searchResult;
        if (lastSeenUid > 0) {
            searchResult = await searchMessagesSinceCheckpoint(connection, lastSeenUid);
        } else {
            searchResult = await searchBootstrapMessages(connection, pollerSinceDate);
        }

        let messages = searchResult.messages || [];
        const rawCount = messages.length;
        const searchLabel = searchResult.searchLabel;

        if (messages.length > 0) {
            // Process oldest first so checkpoint advancement stays ordered and safe.
            messages = messages
                .sort((a, b) => (a.attributes?.uid || 0) - (b.attributes?.uid || 0))
                .slice(0, Math.max(1, MAX_MESSAGES_PER_CYCLE));
            logger.info(`[EmailPoller] Search returned ${rawCount} (${searchLabel}). Processing ${messages.length}. checkpoint=${lastSeenUid || 0}`);
        } else {
            isProcessing = false;
            logger.info(`[EmailPoller] No eligible emails in this cycle (${searchLabel} search returned ${rawCount}). checkpoint=${lastSeenUid || 0}`);
            return;
        }

        const cycleRows = [];
        for (const msg of messages) {
            const messageStart = Date.now();
            const currentUid = parseInt(msg.attributes?.uid || 0, 10);
            try {
                const jobPayload = await buildInboundEmailJobPayload(msg);
                await emailQueue.add(
                    'inbound_email',
                    jobPayload,
                    { jobId: `email_${jobPayload.messageId.replace(/[^a-zA-Z0-9_-]/g, '_')}` }
                );

                // Mark as SEEN only after successful enqueue to prevent repeated mailbox scans.
                await connection.addFlags(msg.attributes.uid, ['\\Seen']);
                await setPollerCheckpoint(pool, currentUid);
                const durationMs = Date.now() - messageStart;
                cycleRows.push({
                    uid: currentUid || '',
                    status: 'queued',
                    response_ms: durationMs,
                    ticket: '',
                    message_id: truncateForTable(jobPayload.messageId || '', 54)
                });
                if (durationMs > EMAIL_MESSAGE_WARN_MS) {
                    logger.warn(`[EmailPoller] Slow email enqueue uid=${msg.attributes?.uid} duration=${durationMs}ms`);
                } else {
                    logger.info(`[EmailPoller] Email queued uid=${msg.attributes?.uid} duration=${durationMs}ms`);
                }
            } catch (err) {
                cycleRows.push({
                    uid: currentUid || '',
                    status: 'enqueue_failed',
                    response_ms: Date.now() - messageStart,
                    ticket: '',
                    message_id: '',
                });
                logger.error(`[EmailPoller] Failed to enqueue email UID ${msg.attributes?.uid}: ${err.message}`);
                // If enqueue failed, leave it UNSEEN and stop so checkpoint ordering stays safe.
                break;
            }
        }
        printCycleTable(cycleRows);
        const cycleDuration = Date.now() - cycleStart;
        if (cycleDuration > EMAIL_CYCLE_WARN_MS) {
            logger.warn(`[EmailPoller] Slow cycle completed in ${cycleDuration}ms`);
        } else {
            logger.info(`[EmailPoller] Cycle completed in ${cycleDuration}ms`);
        }
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

/**
 * Domain-based customer resolution for incoming emails.
 * Priority order:
 *   1. Project-level domain match (exact domain → specific project)
 *   2. Customer-level domain match (domain bubbling up parent domains)
 *   3. Legacy email match (customers.email exact match)
 *   4. Unknown domain → hold for superadmin approval
 *
 * Rule 5: Public email domains (gmail, yahoo, etc.) skip domain routing
 *         and go directly to legacy email match or approval.
 *
 * Returns: { customerId, projectId, customerName, matchType } or null (held for approval)
 */

export async function resolveCustomerByDomain(conn, pool, senderEmail, senderName, rawSubject, bodyText, messageId, inReplyTo, references, logId) {
    const domain = extractDomainFromEmail(senderEmail);
    if (!domain) return null;

    const DEFAULT_PROJECT_ID = parseInt(process.env.EMAIL_DEFAULT_PROJECT_ID || '1', 10);
    const isPublicDomain = PUBLIC_DOMAINS.has(domain);

    // Rule 5: Skip domain-based routing for public email domains
    // They go straight to legacy email match or approval
    if (isPublicDomain) {
        logger.info(`[EmailPoller] Public domain '${domain}' detected — skipping domain routing, using legacy/approval path.`);
    }

    if (!isPublicDomain) {
    // 1. Try exact project-level domain match
    const [projectMatch] = await conn.query(
        `SELECT cd.customer_id, cd.project_id, cd.queue_id, c.name as customer_name
         FROM customer_domains cd
          JOIN customers c ON cd.customer_id = c.id
          WHERE cd.domain = ? AND cd.project_id IS NOT NULL AND cd.is_active = 1 AND c.is_deleted = 0
         LIMIT 1`,
        [domain]
    );
    if (projectMatch.length) {
        return {
            customerId: projectMatch[0].customer_id,
            projectId: projectMatch[0].project_id,
            queueId: projectMatch[0].queue_id,
            customerName: projectMatch[0].customer_name,
            matchType: 'project_domain'
        };
    }

    // 2. Try customer-level domain match (bubble up parent domains)
    //    e.g. for 'shams.multycomm.com' → try ['shams.multycomm.com', 'multycomm.com']
    const domainCandidates = buildDomainCandidates(domain);

    if (domainCandidates.length > 0) {
        const [customerMatch] = await conn.query(
            `SELECT cd.customer_id, cd.queue_id, c.name as customer_name, c.default_project_id
             FROM customer_domains cd
              JOIN customers c ON cd.customer_id = c.id
              WHERE cd.domain IN (?) AND cd.project_id IS NULL AND cd.is_active = 1 AND c.is_deleted = 0
             ORDER BY LENGTH(cd.domain) DESC
             LIMIT 1`,
            [domainCandidates]
        );
        if (customerMatch.length) {
            // Use customer's default_project_id, or fall back to env default
            let projectId = customerMatch[0].default_project_id || null;
            if (!projectId) {
                // Find any project under this customer
                const [fallbackProject] = await conn.query(
                    'SELECT id FROM projects WHERE customer_id = ? AND is_deleted = 0 LIMIT 1',
                    [customerMatch[0].customer_id]
                );
                projectId = fallbackProject.length ? fallbackProject[0].id : DEFAULT_PROJECT_ID;
            }
            return {
                customerId: customerMatch[0].customer_id,
                projectId,
                queueId: customerMatch[0].queue_id,
                customerName: customerMatch[0].customer_name,
                matchType: 'customer_domain'
            };
        }
    }
    } // end if (!isPublicDomain) — steps 1 & 2 skipped for public domains

    // 3. Legacy: exact email match on customers table
    const [emailMatch] = await conn.query(
        'SELECT id, name, default_project_id FROM customers WHERE email = ? AND is_deleted = 0 LIMIT 1',
        [senderEmail]
    );
    if (emailMatch.length) {
        let projectId = emailMatch[0].default_project_id || null;
        if (!projectId) {
            const [fallbackProject] = await conn.query(
                'SELECT id FROM projects WHERE customer_id = ? AND is_deleted = 0 LIMIT 1',
                [emailMatch[0].id]
            );
            projectId = fallbackProject.length ? fallbackProject[0].id : DEFAULT_PROJECT_ID;
        }
        return {
            customerId: emailMatch[0].id,
            projectId,
            queueId: null, // Legacy doesn't support domain-level mapping
            customerName: emailMatch[0].name,
            matchType: 'legacy_email'
        };
    }

    // 4. Unknown domain → create approval request + held email
    logger.info(`[EmailPoller] 🔒 Unknown domain '${domain}' from ${senderEmail}. Creating approval request.`);

    try {
        // Check if an approval request already exists for this domain
        const [existingRequest] = await conn.query(
            `SELECT id FROM domain_approval_requests WHERE domain = ? AND status = 'pending' LIMIT 1`,
            [domain]
        );

        let approvalRequestId;
        if (existingRequest.length) {
            approvalRequestId = existingRequest[0].id;
            logger.info(`[EmailPoller] Existing pending request found for domain '${domain}' (id=${approvalRequestId}). Adding held email.`);
        } else {
            // Create new approval request (first email from this domain)
            const [arResult] = await conn.query(
                `INSERT INTO domain_approval_requests (domain, sender_email, sender_name, email_subject, email_body, message_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [domain, senderEmail, senderName, rawSubject.slice(0, 500), bodyText.slice(0, 5000), messageId]
            );
            approvalRequestId = arResult.insertId;
            logger.info(`[EmailPoller] Created approval request id=${approvalRequestId} for domain '${domain}'.`);
        }

        // Insert held email
        await conn.query(
            `INSERT INTO held_emails (approval_request_id, sender_email, sender_name, subject, body, message_id, in_reply_to, reference_chain)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [approvalRequestId, senderEmail, senderName, rawSubject.slice(0, 500), bodyText.slice(0, 5000),
             messageId, inReplyTo || null, (references || []).join(' ') || null]
        );

        // Update email_logs status to 'held'
        if (logId) {
            await conn.query(
                `UPDATE email_logs SET status = 'processed', error_message = ? WHERE id = ?`,
                [`Held for domain approval (domain: ${domain})`, logId]
            );
        }

        // Notify all superadmins (non-blocking, after commit)
        // We schedule this as a post-commit side effect
        const notifPayload = { domain, senderEmail, senderName, subject: rawSubject, approvalRequestId };
        setTimeout(async () => {
            try {
                const [superadmins] = await pool.query(
                    `SELECT id, name FROM users WHERE role = 'superadmin' AND is_active = 1`
                );
                for (const admin of superadmins) {
                    await createNotification(pool, {
                        user_id: admin.id,
                        type: 'domain_approval',
                        title: `🔒 New Domain Approval: ${notifPayload.domain}`,
                        body: `Email from ${notifPayload.senderEmail} (${notifPayload.subject?.slice(0, 100)}). Requires domain approval.`,
                        entity_id: notifPayload.approvalRequestId
                    });
                }
                // WebSocket broadcast
                try {
                    const { broadcast } = await import('./socketService.js');
                    broadcast('domain_approval_needed', {
                        domain: notifPayload.domain,
                        sender_email: notifPayload.senderEmail,
                        approval_request_id: notifPayload.approvalRequestId
                    });
                } catch (_) {}
            } catch (notifErr) {
                logger.error(`[EmailPoller] Superadmin notification failed (non-fatal): ${notifErr.message}`);
            }
        }, 500);

    } catch (holdErr) {
        logger.error(`[EmailPoller] Failed to create approval request for domain '${domain}': ${holdErr.message}`);
        // Don't throw — let the email be marked as seen so we don't retry endlessly
    }

    return null; // Signal: do NOT create ticket
}

/**
 * Resolve Priority based on keywords in SUBJECT LINE ONLY (Case-Insensitive).
 * 
 * Zoho-inspired approach: Only the subject line determines priority category.
 * Body text is ignored to prevent false positives from common English words.
 * 
 * Returns: { categoryId, isEmergency }
 *   - isEmergency=true  → use P1 directly (triggers emergency broadcast)
 *   - isEmergency=false → use the LOWEST priority in that category (default tier)
 *
 * Emergency: Subject contains BOTH a critical-category indicator AND an emergency phrase.
 *   Emergency phrases: "server down", "system down", "crash", "emergency", "outage"
 *   → This ensures only true emergencies trigger P1 + broadcast to all staff.
 *
 * Category keywords (subject only, word-boundary matched):
 *   "critical"           → Category 1 (P-series), default lowest P tier
 *   "high" / "urgent"    → Category 2 (Q-series), default lowest Q tier
 *   "medium"             → Category 3 (R-series), default lowest R tier
 *   "low"                → Category 4 (S-series), default lowest S tier
 *   (no match)           → Category 2 (Q-series), default — safe fallback
 */
function resolvePriorityFromText(subject = '', body = '') {
    // IMPORTANT: Only scan SUBJECT for keywords. Body is too noisy.
    const subjectLower = (subject || '').toLowerCase();

    // Word-boundary helper — prevents "highlighted" matching "high", etc.
    const hasWord = (text, word) => new RegExp(`\\b${word}\\b`, 'i').test(text);
    const hasPhrase = (text, phrase) => text.includes(phrase.toLowerCase());

    // 1. Emergency detection: subject must contain an emergency phrase
    //    Emergency phrases are multi-word or specific enough to avoid false positives
    const emergencyPhrases = ['server down', 'system down', 'crash', 'emergency', 'outage'];
    const hasEmergencyPhrase = emergencyPhrases.some(phrase => hasPhrase(subjectLower, phrase));

    // Emergency = emergency phrase present (these inherently imply critical severity)
    if (hasEmergencyPhrase) {
        logger.info(`[EmailPoller] 🚨 Emergency keyword detected in subject: "${subject}"`);
        return { categoryId: 1, isEmergency: true };   // → P1 (highest severity)
    }

    // 2. Category keyword scan — subject only, word-boundary, most severe first
    if (hasWord(subjectLower, 'critical')) {
        return { categoryId: 1, isEmergency: false };   // → lowest P (e.g. P2)
    }
    if (hasWord(subjectLower, 'high') || hasWord(subjectLower, 'urgent')) {
        return { categoryId: 2, isEmergency: false };   // → lowest Q (e.g. Q1)
    }
    if (hasWord(subjectLower, 'medium')) {
        return { categoryId: 3, isEmergency: false };   // → lowest R (e.g. R1)
    }
    if (hasWord(subjectLower, 'low')) {
        return { categoryId: 4, isEmergency: false };   // → lowest S (e.g. S1)
    }

    // 3. No keyword matched — default to High (Q) category
    return { categoryId: 2, isEmergency: false };
}

export async function processOneEmail(pool, msg, connection, defaultProjectId, defaultPriority, systemUserId) {
    const allPart = msg.parts.find(p => p.which === '');
    if (!allPart) return { status: 'missing_body' };

    let parsed;
    try {
        parsed = await simpleParser(Buffer.from(allPart.body));
    } catch (parseErr) {
        logger.error(`[EmailPoller] Failed to parse email body: ${parseErr.message}`);
        return { status: 'parse_failed' };
    }

    const messageId = normalizeMessageId(parsed.messageId);
    if (!messageId) {
        logger.warn(`[EmailPoller] Email has no Message-ID header — skipping to prevent DB errors.`);
        return { status: 'missing_message_id' };
    }

    const inReplyTo = normalizeMessageId(parsed.inReplyTo);
    const references = normalizeMessageIdList(parsed.references);
    const fromRaw = parsed.from?.text || '';
    const senderEmail = normalizeEmail(fromRaw);
    const senderName = parsed.from?.value?.[0]?.name || senderEmail;

    if (!senderEmail || senderEmail === SUPPORT_EMAIL || senderEmail === GMAIL_POLLER_EMAIL) {
        return { status: 'self_email', messageId };
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
        return { status: `skip_${existingLog[0].status}`, messageId };
    }

    const [existingMsg] = await pool.query(
        `SELECT id FROM conversation_messages WHERE message_id IN (?) LIMIT 1`,
        [messageIdVariants(messageId)]
    );
    if (existingMsg.length) {
        logger.info(`[EmailPoller] ℹ️ Skipping duplicate message in DB: ${messageId}`);
        return { status: 'skip_duplicate_db', messageId };
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
                return { status: 'skip_race_duplicate', messageId }; // Silent exit
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

        const internalMsgId = msgResult.insertId;

        // 2.5 Save Attachments if any
        if (parsed.attachments && parsed.attachments.length > 0) {
            await saveEmailAttachments(conn, internalMsgId, parsed.attachments);
        }

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
                publishBroadcast('new_message', {
                    id: msgResult.insertId,
                    ticket_id: ticketId,
                    conversation_id: conversationId,
                    sender_type: 'customer',
                    sender_name: senderName,
                    message_body: bodyText,
                    created_at: new Date().toISOString()
                });

                // Notify UI that this ticket was updated (for list refreshes)
                publishBroadcast('ticket_updated', {
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
        return { status: 'reply_threaded', messageId, ticketNumber };
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
            const appendResult = await appendReply(matchedTicketId, matchedConvId, matchedNum);
            await conn.commit();
            return appendResult || { status: 'reply_threaded', messageId, ticketNumber: matchedNum };
        }

        // Create New Ticket — Domain-Based Customer Resolution
        logger.info(`[EmailPoller] Match result: reason=new_ticket messageId=${messageId} inReplyTo=${inReplyTo || ''}`);
        logger.info(`[EmailPoller] No thread match for ${messageId}. Resolving customer by domain for sender=${senderEmail}, subject="${rawSubject.slice(0, 120)}"`);

        const domainResolution = await resolveCustomerByDomain(conn, pool, senderEmail, senderName, rawSubject, bodyText, messageId, inReplyTo, references, logId);

        if (!domainResolution) {
            // Unknown domain — email has been held for superadmin approval. Commit and exit.
            await conn.commit();
            logger.info(`[EmailPoller] ⏸️ Email held for domain approval: ${senderEmail} (messageId=${messageId})`);
            return { status: 'held_for_approval', messageId };
        }

        const { customerId, customerName: resolvedCustomerName, matchType: domainMatchType, queueId: resolvedQueueId } = domainResolution;
        let { projectId: resolvedProjectId } = domainResolution;

        logger.info(`[EmailPoller] Domain resolved: type=${domainMatchType} customer=${customerId} project=${resolvedProjectId}`);

        // Safety verification: Ensure the project_id exists before inserting, as DB wipes can cause foreign key failures
        if (resolvedProjectId) {
            const [pCheck] = await pool.query('SELECT id FROM projects WHERE id = ?', [resolvedProjectId]);
            if (!pCheck.length) resolvedProjectId = null;
        }

        // 5. Create Ticket (Relational SLA 2.1)
        const { SlaCalculator } = await import('./sla/calculator.js');
        
        // Dynamic Resolution: Scan keywords (Case-Insensitive)
        const { categoryId, isEmergency } = resolvePriorityFromText(rawSubject, bodyText);
        
        // Map to DB priority using category_id:
        //   Emergency → P1 (level ASC = most severe)
        //   Normal    → Lowest tier in that category (level DESC = least severe default)
        const sortOrder = isEmergency ? 'ASC' : 'DESC';
        const [prioRows] = await pool.query(
            `SELECT id, name FROM priorities 
             WHERE category_id = ? AND is_active = 1 
             ORDER BY level ${sortOrder} LIMIT 1`,
            [categoryId]
        );
        const priorityId = prioRows[0]?.id || 2; // Fallback to Q1 (id 2)
        const priorityName = prioRows[0]?.name || 'Q1';
        const finalPriority = priorityName; // For Payload
        logger.info(`[EmailPoller] Priority resolved: keyword_cat=${categoryId} emergency=${isEmergency} → ${priorityName} (ID:${priorityId})`);

        const resolvedTz = await resolveTicketTimezone(pool, { customerId, projectId: resolvedProjectId });
        const slaPolicy = await resolveSlaPolicy(pool, { customerId, projectId: resolvedProjectId, priorityId });
        const calendar = await getSlaCalendar(pool);
        const calendarForTicket = { ...calendar, timezone: resolvedTz || calendar?.timezone || TZ };
        const calculator = new SlaCalculator(pool);
        
        const nowStr = moment().tz(TZ).format('YYYY-MM-DD HH:mm:ss');
        const strMoment = calculator.computeDueDate(nowStr, slaPolicy.first_response_hrs, calendarForTicket);
        const str = strMoment.format('YYYY-MM-DD HH:mm:ss');
        const etrMoment = calculator.computeDueDate(nowStr, slaPolicy.resolution_hrs, calendarForTicket);
        const etr = etrMoment.format('YYYY-MM-DD HH:mm:ss');

        const ticketNumber = await generateTicketNumber(pool, priorityId);
        
        const [tResult] = await pool.query(
            `INSERT INTO tickets (
                ticket_number, subject, customer_id, project_id, queue_id, category, priority, priority_id, description, 
                status, escalation_level, sla_state, str, etr, created_by, assigned_to, source, assignment_source,
                resolved_timezone, sla_policy_id, sla_version
            )
            VALUES (?,?,?,?,?,?,?,?,?, 'open', 1, 'active', ?, ?, ?, NULL, 'email', 'auto', ?, ?, ?)`,
            [
                ticketNumber, rawSubject.slice(0, 500), customerId, resolvedProjectId, resolvedQueueId || null, cleanSubject.slice(0, 250), 
                priorityName, priorityId, description, str, etr, systemUserId,
                resolvedTz, slaPolicy.id, slaPolicy.version
            ]
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
        const internalMsgId = msgResult.insertId;

        // 5.5 Save Attachments if any
        if (parsed.attachments && parsed.attachments.length > 0) {
            await saveEmailAttachments(conn, internalMsgId, parsed.attachments);
        }

        // Add Participants (To + CC + BCC)
        await conn.query(`INSERT INTO conversation_participants (conversation_id, email, type) VALUES (?, ?, 'to')`, [conversationId, senderEmail]);
        
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

        await conn.query('INSERT INTO ticket_activities (ticket_id, action, note) VALUES (?, "created", ?)', [ticketId, `Auto-created from email: ${senderEmail}`]);

        await conn.commit();

        // Step 6: Trigger the 8-Step Enterprise Pipeline
        const { workflowEvents } = await import('../modules/workflows/workflowEngine.js');
        workflowEvents.emit('ticket_created', {
            ticketId,
            payload: { 
                customer_id: customerId, 
                project_id: resolvedProjectId, 
                category: cleanSubject.slice(0, 250), 
                priority: finalPriority, 
                status: 'open', 
                source: 'email',
                queue_id: resolvedQueueId || null
            }
        });
        
        // Step 7: Acknowledgement is handled by workflowEngine → handleTicketCreatedNotification
        // DO NOT send here — it would cause DUPLICATE emails to the customer.
        // The workflow engine sends the FINAL version with corrected ETR after rule processing.

        // Step 7b: Emergency Broadcast (P1 only — when emergency keywords detected)
        if (isEmergency && !isAutomated) {
            try {
                logger.info(`[EmailPoller] 🚨 EMERGENCY P1 detected for ${ticketNumber}. Triggering broadcast.`);
                await sendEmergencyBroadcast({
                    id: ticketId,
                    ticket_number: ticketNumber,
                    category: cleanSubject.slice(0, 250),
                    priority: priorityName,
                    description: description,
                    etr: etr
                });
                logger.info(`[EmailPoller] ✅ Emergency broadcast completed for ${ticketNumber}`);
            } catch (emergErr) {
                logger.error(`[EmailPoller] Emergency broadcast failed (non-blocking): ${emergErr.message}`);
            }
        }

        // Mark as processed in email logs
        if (logId) await conn.query(`UPDATE email_logs SET status='processed' WHERE id=?`, [logId]);
        logger.info(`[EmailPoller] 🆕 Ingested ticket ${ticketNumber}. Handed off to Enterprise Pipeline.`);

        // Real-time broadcasts for UI
        try {
            if (!isAutomated) {
                publishBroadcast('new_ticket', { id: ticketId, ticket_number: ticketNumber, status: 'open', created_at: nowStr });
            }
        } catch (_) {}

        return { status: 'ticket_created', messageId, ticketNumber };

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
            logger.info(mailLogColors.inbound(`[EmailPoller] INBOUND mail received (${numNewMsgs || 0}). Triggering immediate scan.`));
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
