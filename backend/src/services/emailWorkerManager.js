import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';
import { publishBroadcast } from './realtimeEvents.js';
import { startEmailQueueWorker, stopEmailQueueWorker } from '../workers/emailWorker.js';
import { startOutboundEmailWorker, stopOutboundEmailWorker } from '../workers/outboundEmailWorker.js';
import { startEmailPoller } from './emailPoller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EMAIL_RUNTIME_MODE = (process.env.EMAIL_RUNTIME_MODE || 'worker_thread').toLowerCase();
const EMAIL_WORKER_RESTART_DELAY_MS = Math.max(1000, parseInt(process.env.EMAIL_WORKER_RESTART_DELAY_MS || '5000', 10));

let emailWorker = null;
let isStopping = false;

function wireWorker(worker) {
    worker.on('message', (msg) => {
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'broadcast') {
            publishBroadcast(msg.event, msg.data);
            return;
        }

        if (msg.type === 'fatal') {
            logger.error(`[EmailWorker] Fatal worker event: ${msg.error}`);
        }
    });

    worker.on('error', (err) => {
        logger.error(`[EmailWorker] Thread error: ${err.message}`);
    });

    worker.on('exit', (code) => {
        emailWorker = null;

        if (isStopping) {
            logger.info('[EmailWorker] Worker stopped cleanly.');
            return;
        }

        logger.warn(`[EmailWorker] Worker exited with code ${code}. Restarting in ${EMAIL_WORKER_RESTART_DELAY_MS}ms.`);
        setTimeout(() => {
            startEmailWorkerManager().catch((err) => {
                logger.error(`[EmailWorker] Restart failed: ${err.message}`);
            });
        }, EMAIL_WORKER_RESTART_DELAY_MS);
    });
}

export async function startEmailWorkerManager() {
    startEmailQueueWorker();
    startOutboundEmailWorker();

    if (EMAIL_RUNTIME_MODE === 'disabled') {
        logger.info('[EmailWorker] Email runtime disabled. Queue workers only are active.');
        return;
    }

    if (EMAIL_RUNTIME_MODE === 'worker_thread') {
        if (emailWorker) {
            logger.info('[EmailWorker] Worker already running.');
            return;
        }

        const workerPath = path.resolve(__dirname, '../workers/emailWorkerThread.js');
        logger.info(`[EmailWorker] Starting dedicated IMAP producer thread from ${workerPath}`);
        emailWorker = new Worker(workerPath, {
            env: process.env,
            type: 'module'
        });
        wireWorker(emailWorker);
        return;
    }

    if (EMAIL_RUNTIME_MODE === 'inline') {
        logger.warn('[EmailWorker] EMAIL_RUNTIME_MODE=inline. IMAP producer will run in the API process.');
        await startEmailPoller();
        return;
    }

    logger.info(`[EmailWorker] Running without producer thread because EMAIL_RUNTIME_MODE=${EMAIL_RUNTIME_MODE}`);
}

export async function stopEmailWorkerManager() {
    isStopping = true;
    if (emailWorker) {
        await emailWorker.terminate();
        emailWorker = null;
    }
    await stopEmailQueueWorker();
    await stopOutboundEmailWorker();
}
