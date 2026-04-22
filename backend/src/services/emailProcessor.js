import { simpleParser } from 'mailparser';
import { logger } from '../logger.js';

function normalizeMessageId(raw = '') {
    return String(raw || '').replace(/[<>]/g, '').trim();
}

export async function buildInboundEmailJobPayload(msg) {
    const allPart = msg?.parts?.find?.((part) => part.which === '');
    if (!allPart?.body) {
        throw new Error('Email message is missing raw body content');
    }

    const parsed = await simpleParser(Buffer.from(allPart.body));
    const messageId = normalizeMessageId(parsed.messageId) || `uid-${msg.attributes?.uid || Date.now()}`;

    return {
        uid: parseInt(msg.attributes?.uid || 0, 10) || null,
        messageId,
        rawBody: allPart.body,
        subject: parsed.subject || 'No Subject',
        from: parsed.from?.text || ''
    };
}

export async function processInboundEmailJob(jobData = {}) {
    const rawBody = jobData.rawBody;
    if (!rawBody) {
        throw new Error('Inbound email job missing rawBody');
    }

    const message = {
        parts: [{ which: '', body: rawBody }],
        attributes: { uid: jobData.uid || null }
    };

    const { processOneEmail } = await import('./emailPoller.js');
    const connectDB = (await import('../db/index.js')).default;
    const pool = connectDB();

    return processOneEmail(
        pool,
        message,
        null,
        parseInt(process.env.EMAIL_DEFAULT_PROJECT_ID || '1', 10),
        process.env.EMAIL_DEFAULT_PRIORITY || 'High',
        parseInt(process.env.EMAIL_SYSTEM_USER_ID || '5', 10)
    );
}

export function printWorkerJobTable(rows) {
    if (!rows?.length || typeof console.table !== 'function') return;
    try {
        console.table(rows);
    } catch (err) {
        logger.warn(`[EmailWorker] Failed to render console.table: ${err.message}`);
    }
}
