import { Queue } from 'bullmq';
import redis from '../config/redis.js';

export const emailQueue = new Queue('emailQueue', {
    connection: redis,
    defaultJobOptions: {
        attempts: Math.max(3, parseInt(process.env.EMAIL_QUEUE_ATTEMPTS || '5', 10)),
        backoff: { type: 'exponential', delay: Math.max(1000, parseInt(process.env.EMAIL_QUEUE_BACKOFF_MS || '5000', 10)) },
        removeOnComplete: Math.max(200, parseInt(process.env.EMAIL_QUEUE_REMOVE_ON_COMPLETE || '500', 10)),
        removeOnFail: false
    }
});
