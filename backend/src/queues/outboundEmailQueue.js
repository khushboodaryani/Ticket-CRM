import { Queue } from 'bullmq';
import redis from '../config/redis.js';

export const outboundEmailQueue = new Queue('outboundEmailQueue', {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 200,
        removeOnFail: false
    }
});

