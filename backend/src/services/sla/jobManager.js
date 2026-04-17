// backend/src/services/sla/jobManager.js
import { Queue, Worker } from 'bullmq';
import redis, { redisConfig } from '../../config/redis.js';
import { logger } from '../../logger.js';
import { SlaCalculator } from './calculator.js';
import connectDB from '../../db/index.js';
import moment from 'moment-timezone';

const slaQueue = new Queue('slaQueue', { connection: redis });

/**
 * Enterprise Job Manager
 * Handles exactly-timed SLA events with dynamic removal/pause support.
 */
export class SlaJobManager {
    constructor(pool) {
        this.pool = pool || connectDB();
        this.calculator = new SlaCalculator(this.pool);
    }

    /**
     * Schedules 3 precisely timed jobs for a ticket:
     * 1. PRE_BREACH_WARNING
     * 2. BREACH (Resolution Goal)
     * 3. ESCALATION (if applicable)
     */
    async scheduleJobs(ticket, calendar) {
        const ticketId = ticket.id;
        
        // Remove any existing jobs for this ticket first (Idempotency)
        await this.cancelJobs(ticketId);

        // 1. Resolve Times and Timezones
        const timezone = ticket.resolved_timezone || calendar.timezone;
        
        // 2. Schedule Resolution Breach
        const resolutionDueDate = moment.utc(ticket.etr);
        const delay = Math.max(0, resolutionDueDate.diff(moment.utc()));

        await slaQueue.add(
            `breach_${ticketId}`,
            { ticketId, type: 'RESOLUTION_BREACH' },
            { 
                delay, 
                jobId: `sla_breach_${ticketId}`,
                attempts: 5,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: true
            }
        );

        // 3. Schedule Pre-Breach Warning (e.g., 30 mins before)
        const warningDelay = Math.max(0, delay - (30 * 60 * 1000));
        if (warningDelay > 0) {
            await slaQueue.add(
                `warning_${ticketId}`,
                { ticketId, type: 'PRE_BREACH_WARNING' },
                { 
                    delay: warningDelay, 
                    jobId: `sla_warning_${ticketId}`,
                    removeOnComplete: true 
                }
            );
        }

        logger.info(`[SLA-Job] Scheduled jobs for Ticket #${ticketId}. Breach in ${Math.round(delay/60000)}m`);
    }

    /**
     * Atomically cancels all pending SLA jobs for a ticket.
     * Used when ticket is Resolved, Closed, or put On Hold.
     */
    async cancelJobs(ticketId) {
        const jobs = [
            `sla_breach_${ticketId}`,
            `sla_warning_${ticketId}`,
            `sla_first_resp_${ticketId}`
        ];

        for (const jobId of jobs) {
            const job = await slaQueue.getJob(jobId);
            if (job) {
                await job.remove();
            }
        }
        logger.debug(`[SLA-Job] Cancelled pending jobs for Ticket #${ticketId}`);
    }
}

export const jobManager = new SlaJobManager();
