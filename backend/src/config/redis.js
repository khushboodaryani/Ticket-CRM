// backend/src/config/redis.js
import IORedis from 'ioredis';
import { logger } from '../logger.js';

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
};

const redis = new IORedis(redisConfig);

redis.on('error', (err) => {
    logger.error('[Redis] Error: ' + err.message);
});

redis.on('connect', () => {
    logger.info('[Redis] Connected successfully');
});

export default redis;
export { redisConfig };
