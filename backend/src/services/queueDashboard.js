import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue } from '../queues/emailQueue.js';
import { outboundEmailQueue } from '../queues/outboundEmailQueue.js';
import { logger } from '../logger.js';

let isMounted = false;

export function mountQueueDashboard(app) {
    if (isMounted || String(process.env.ENABLE_BULL_BOARD || 'true').toLowerCase() !== 'true') {
        return;
    }

    const serverAdapter = new ExpressAdapter();
    const routePath = process.env.BULL_BOARD_PATH || '/admin/queues';
    serverAdapter.setBasePath(routePath);

    createBullBoard({
        queues: [
            new BullMQAdapter(emailQueue),
            new BullMQAdapter(outboundEmailQueue)
        ],
        serverAdapter
    });

    // Redirect /admin/queues to /admin/queues/ so relative assets load correctly
    app.get(routePath, (req, res) => res.redirect(`${routePath}/`));
    
    app.use(routePath, serverAdapter.getRouter());
    isMounted = true;
    logger.info(`[BullBoard] Dashboard mounted at ${routePath}`);
}
