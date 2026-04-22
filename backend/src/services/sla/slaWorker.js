// backend/src/services/sla/slaWorker.js
import { Worker } from 'bullmq';
import redis from '../../config/redis.js';
import { logger } from '../../logger.js';
import connectDB from '../../db/index.js';
import { jobManager } from './jobManager.js';
import { sendSlaBreachNotification } from '../../modules/notifications/emailService.js';

export const startSlaWorker = () => {
    const worker = new Worker('slaQueue', async (job) => {
        const { ticketId, type } = job.data;
        const pool = connectDB();

        logger.info(`[SLA-Worker] Processing ${type} for Ticket #${ticketId}`);

        try {
            // 1. Fetch current ticket status
            const [rows] = await pool.query(
                `SELECT t.*, c.name as customer_name, c.email as customer_email,
                        u.name as assigned_to_name
                 FROM tickets t 
                 LEFT JOIN customers c ON t.customer_id = c.id
                 LEFT JOIN users u ON t.assigned_to = u.id
                 WHERE t.id = ?`, 
                [ticketId]
            );
            if (!rows.length) return;
            const ticket = rows[0];

            // 2. If ticket is terminal (resolved/closed), skip
            if (['resolved', 'closed'].includes(ticket.status)) {
                logger.debug(`[SLA-Worker] Ticket #${ticketId} is ${ticket.status}. Skipping.`);
                return;
            }

            // 3. Handle Events
            switch (type) {
                case 'PRE_BREACH_WARNING':
                    await handleWarning(pool, ticket);
                    break;
                case 'RESOLUTION_BREACH':
                    await handleBreach(pool, ticket);
                    break;
                case 'FIRST_RESPONSE_BREACH':
                    await handleFirstResponseBreach(pool, ticket);
                    break;
            }

        } catch (err) {
            logger.error(`[SLA-Worker] Job failed for Ticket #${ticketId}: ${err.message}`);
            throw err; // Allow BullMQ retry
        }
    }, { 
        connection: redis,
        concurrency: 5 // Process 5 events in parallel
    });

    worker.on('failed', (job, err) => {
        logger.error(`[SLA-Worker] Job ${job.id} failed with ${err.message}`);
    });
};

async function handleWarning(pool, ticket) {
    logger.warn(`[SLA-Warning] Ticket #${ticket.ticket_number} is approaching breach!`);
    
    await pool.query(
        `INSERT INTO sla_event_logs (ticket_id, event_type, note) 
         VALUES (?, 'pre_breach_warning', 'Pre-breach warning triggered')`,
        [ticket.id]
    );

    // TODO: Trigger notification service (e.g. Email/Socket)
}

async function handleBreach(pool, ticket) {
    if (ticket.sla_state === 'breached') return;

    logger.error(`[SLA-Breach] Ticket #${ticket.ticket_number} HAS BREACHED!`);

    await pool.query(
        `UPDATE tickets SET sla_state = 'breached' WHERE id = ?`,
        [ticket.id]
    );

    await pool.query(
        `INSERT INTO sla_event_logs (ticket_id, event_type, old_etr, note) 
         VALUES (?, 'breach', ?, 'Resolution breach detected')`,
        [ticket.id, ticket.etr]
    );

    // Update Activity Log
    await pool.query(
        `INSERT INTO ticket_activities (ticket_id, action, note) VALUES (?, 'auto_escalated', 'SLA BREACHED: Ticket moved to critical status.')`,
        [ticket.id]
    );

    // Trigger Customer Notification
    if (ticket.customer_email) {
        sendSlaBreachNotification(ticket, ticket.customer_email).catch(err => 
            logger.error(`[SLA-Breach] Failed to send customer notification: ${err.message}`)
        );
    }
}

async function handleFirstResponseBreach(pool, ticket) {
    if (ticket.is_first_response_met) return;

    logger.error(`[SLA-Breach] Ticket #${ticket.ticket_number} failed First Response SLA!`);
    
    // Logic for first response breach (e.g. Notify TL)
}
