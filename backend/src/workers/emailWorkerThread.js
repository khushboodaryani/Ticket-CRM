import { parentPort } from 'worker_threads';
import { logger } from '../logger.js';
import connectDB from '../db/index.js';
import { startEmailPoller } from '../services/emailPoller.js';

process.title = 'Ticket CRM Email Worker';

process.on('uncaughtException', (err) => {
    logger.error(`[EmailWorker] Uncaught exception: ${err.message}`);
    throw err;
});

process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    logger.error(`[EmailWorker] Unhandled rejection: ${message}`);
    throw reason;
});

async function boot() {
    const pool = connectDB();
    const connection = await pool.getConnection();
    connection.release();

    logger.info('[EmailWorker] Dedicated email worker thread started.');
    await startEmailPoller();
}

boot().catch((err) => {
    logger.error(`[EmailWorker] Startup failed: ${err.message}`);
    if (parentPort) {
        parentPort.postMessage({
            type: 'fatal',
            error: err.message
        });
    }
    process.exit(1);
});
