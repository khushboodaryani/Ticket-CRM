import { isMainThread, parentPort } from 'worker_threads';
import { broadcast } from './socketService.js';
import { logger } from '../logger.js';

export function publishBroadcast(event, data) {
    if (!event) return;

    if (!isMainThread && parentPort) {
        parentPort.postMessage({
            type: 'broadcast',
            event,
            data
        });
        return;
    }

    try {
        broadcast(event, data);
    } catch (err) {
        logger.warn(`[Realtime] Broadcast failed for ${event}: ${err.message}`);
    }
}

