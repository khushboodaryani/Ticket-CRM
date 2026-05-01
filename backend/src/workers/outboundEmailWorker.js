import { Worker } from 'bullmq';
import redis from '../config/redis.js';
import { logger } from '../logger.js';
import { transporter } from '../services/mailTransport.js';
import { persistQueuedOutboundSuccess } from '../modules/notifications/emailPersistence.js';

let worker;


function printOutboundTable(rows) {
    if (!rows?.length || typeof console.table !== 'function') return;
    try {
        console.table(rows);
    } catch (_) {}
}

export function startOutboundEmailWorker() {
    if (worker) return worker;

    worker = new Worker(
        'outboundEmailQueue',
        async (job) => {
            const startedAt = Date.now();
            const { mailOptions, metadata } = job.data || {};
            if (!mailOptions) {
                throw new Error('Outbound email job missing mailOptions');
            }

            const trustedMailOptions = {
                ...mailOptions,
                headers: {
                    ...(mailOptions.headers || {}),
                    'X-Source': 'internal',
                    'X-Ticket-CRM-Origin': 'outbound'
                }
            };
            const info = await transporter.sendMail(trustedMailOptions);
            await persistQueuedOutboundSuccess({ ...(metadata || {}), sentMessageId: info?.messageId });

            const durationMs = Date.now() - startedAt;
            printOutboundTable([{
                queue: 'outboundEmailQueue',
                job_id: job.id,
                type: metadata?.type || job.name,
                status: 'sent',
                response_ms: durationMs,
                target: metadata?.target || trustedMailOptions.to || trustedMailOptions.bcc || ''
            }]);
            logger.info(`\x1b[1;92m[OutboundEmailWorker] Sent ${metadata?.type || job.name} job=${job.id} duration=${durationMs}ms\x1b[0m`);
        },
        {
            connection: redis,
            concurrency: 5,
            limiter: {
                max: 100,
                duration: 60000
            }
        }
    );

    worker.on('failed', (job, err) => {
        printOutboundTable([{
            queue: 'outboundEmailQueue',
            job_id: job?.id || '',
            type: job?.data?.metadata?.type || job?.name || '',
            status: 'failed',
            response_ms: '',
            target: job?.data?.metadata?.target || ''
        }]);
        logger.error(`[OutboundEmailWorker] Job ${job?.id || 'unknown'} failed: ${err.message}`);
    });

    logger.info('[OutboundEmailWorker] BullMQ outbound email worker started.');
    return worker;
}

export async function stopOutboundEmailWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
}
