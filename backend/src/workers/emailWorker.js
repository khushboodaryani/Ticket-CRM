import { Worker } from 'bullmq';
import redis from '../config/redis.js';
import { logger } from '../logger.js';
import { processInboundEmailJob, printWorkerJobTable } from '../services/emailProcessor.js';

let worker;

export function startEmailQueueWorker() {
    if (worker) return worker;

    worker = new Worker(
        'emailQueue',
        async (job) => {
            const startedAt = Date.now();
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
            concurrency: 3,
            limiter: {
                max: 10,
                duration: 30000
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
        logger.error(`[EmailWorker] Job ${job?.id || 'unknown'} failed: ${err.message}`);
    });

    logger.info('[EmailWorker] BullMQ inbound email worker started.');
    return worker;
}

export async function stopEmailQueueWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
}

