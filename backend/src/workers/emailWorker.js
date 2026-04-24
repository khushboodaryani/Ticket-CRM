import { Worker } from 'bullmq';
import redis from '../config/redis.js';
import { logger } from '../logger.js';
import { processInboundEmailJob, printWorkerJobTable } from '../services/emailProcessor.js';

let worker;
const EMAIL_WORKER_CONCURRENCY = Math.max(1, parseInt(process.env.EMAIL_WORKER_CONCURRENCY || '8', 10));
const EMAIL_WORKER_LIMIT_MAX = Math.max(EMAIL_WORKER_CONCURRENCY, parseInt(process.env.EMAIL_WORKER_LIMIT_MAX || '60', 10));
const EMAIL_WORKER_LIMIT_DURATION_MS = Math.max(1000, parseInt(process.env.EMAIL_WORKER_LIMIT_DURATION_MS || '30000', 10));

export function startEmailQueueWorker() {
    if (worker) return worker;

    worker = new Worker(
        'emailQueue',
        async (job) => {
            const startedAt = Date.now();
            logger.info(
                `[EmailWorker] Starting inbound job ${job.id} uid=${job.data?.uid || ''} attempt=${(job.attemptsMade || 0) + 1}`
            );
            const result = await processInboundEmailJob(job.data);
            const durationMs = Date.now() - startedAt;

            printWorkerJobTable([{
                queue: 'emailQueue',
                job_id: job.id,
                uid: job.data?.uid || '',
                status: result?.status || 'processed',
                ticket: result?.ticketNumber || '',
                response_ms: durationMs
            }]);

            logger.info(`[EmailWorker] Processed inbound job ${job.id} status=${result?.status || 'processed'} duration=${durationMs}ms`);
            return result;
        },
        {
            connection: redis,
            concurrency: EMAIL_WORKER_CONCURRENCY,
            limiter: {
                max: EMAIL_WORKER_LIMIT_MAX,
                duration: EMAIL_WORKER_LIMIT_DURATION_MS
            }
        }
    );

    worker.on('failed', (job, err) => {
        printWorkerJobTable([{
            queue: 'emailQueue',
            job_id: job?.id || '',
            uid: job?.data?.uid || '',
            status: 'failed',
            ticket: '',
            response_ms: ''
        }]);
        logger.error(
            `[EmailWorker] Job ${job?.id || 'unknown'} failed: ${err.message}. uid=${job?.data?.uid || ''} attempts=${job?.attemptsMade || 0}/${job?.opts?.attempts || 0}`
        );
    });

    logger.info(
        `[EmailWorker] BullMQ inbound email worker started. concurrency=${EMAIL_WORKER_CONCURRENCY} limiter=${EMAIL_WORKER_LIMIT_MAX}/${EMAIL_WORKER_LIMIT_DURATION_MS}ms`
    );
    return worker;
}

export async function stopEmailQueueWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
}
