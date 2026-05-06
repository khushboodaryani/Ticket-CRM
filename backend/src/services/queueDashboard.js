import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue } from '../queues/emailQueue.js';
import { outboundEmailQueue } from '../queues/outboundEmailQueue.js';
import { logger } from '../logger.js';

let isMounted = false;

export function mountQueueDashboard(app) {
    const isEnabled = String(process.env.ENABLE_BULL_BOARD || 'true').toLowerCase() === 'true';

    if (!isEnabled) {
        logger.info('[BullBoard] Dashboard is disabled via ENABLE_BULL_BOARD');
        return;
    }

    if (isMounted) {
        logger.warn('[BullBoard] Dashboard already mounted, skipping');
        return;
    }

    const routePath = process.env.BULL_BOARD_PATH || '/admin/queues';

    app.get(`${routePath}/health`, (req, res) => {
        res.json({
            status: 'ok',
            message: 'Bull Board is configured',
            path: routePath,
            mounted: isMounted,
            queues: ['emailQueue', 'outboundEmailQueue']
        });
    });

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath(routePath);

    createBullBoard({
        queues: [
            new BullMQAdapter(emailQueue),
            new BullMQAdapter(outboundEmailQueue)
        ],
        serverAdapter
    });

    app.use(routePath, (req, res, next) => {
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        next();
    }, serverAdapter.getRouter());

    isMounted = true;
    logger.info(`[BullBoard] Dashboard mounted at ${routePath}`);
}