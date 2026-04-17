// src/services/slaEngine.js
/**
 * SLA Engine – Cron job that runs every 5 minutes.
 * 
 * Logic:
 * 1. Fetch all open/in_progress tickets
 * 2. For each ticket, check shift/holiday → pause/resume SLA (pushes ETR)
 * 3. Perform dynamic escalation check using Policy + Queue Modifiers
 * 4. Trigger breaches and notifications
 */
import cron from "node-cron";
import moment from "moment-timezone";
import connectDB from "../db/index.js";
import { logger } from "../logger.js";
import { getEffectiveTicketSLA, getQueueModifier } from "../modules/sla/slaPolicyService.js";

const TZ = process.env.TIMEZONE || "Asia/Kolkata";

// Check if today is a holiday
async function isHoliday(pool, dateStr) {
    const [rows] = await pool.query(
        `SELECT id FROM holidays WHERE holiday_date = ? LIMIT 1`,
        [dateStr]
    );
    return rows.length > 0;
}

// Check if current time is within an active shift for the ticket's assigned user
async function isWithinShift(pool, userId) {
    const dayAbbr = moment().tz(TZ).format("ddd");
    const curTime = moment().tz(TZ).format("HH:mm:ss");

    const [shifts] = await pool.query(
        `SELECT s.start_time, s.end_time, s.working_days
         FROM shifts s
         JOIN shift_members sm ON sm.shift_id = s.id
         WHERE sm.user_id = ?`,
        [userId]
    );

    for (const shift of shifts) {
        let days = [];
        try { days = JSON.parse(shift.working_days); } catch { continue; }
        if (!days.includes(dayAbbr)) continue;

        const { start_time: start, end_time: end } = shift;
        if (start <= end) {
            if (curTime >= start && curTime <= end) return true;
        } else {
            if (curTime >= start || curTime <= end) return true;
        }
    }
    return false;
}

// Find the next escalation target user based on current assignee
async function findNextAssignee(pool, currentAssigneeId) {
    if (!currentAssigneeId) return null;
    const [rows] = await pool.query(
        `SELECT reporting_to FROM users WHERE id=? LIMIT 1`,
        [currentAssigneeId]
    );
    return rows[0]?.reporting_to || null;
}

async function runSLAEngine() {
    const pool = connectDB();
    const todayStr = moment().tz(TZ).format("YYYY-MM-DD");
    const nowMoment = moment().tz(TZ);

    try {
        const holiday = await isHoliday(pool, todayStr);

        // Fetch all active tickets that haven't reached terminal escalation
        const [tickets] = await pool.query(
            `SELECT t.* FROM tickets t 
             WHERE t.status IN ('open', 'in_progress', 'held') AND t.escalation_level < 4`
        );

        if (tickets.length > 0) {
            logger.info(`[SLA Engine] Processing ${tickets.length} active tickets...`);
        }

        for (const ticket of tickets) {
            try {
                const assignedUserId = ticket.assigned_to;
                // If unassigned, we assume always in shift (global pool model)
                const inShift = assignedUserId ? await isWithinShift(pool, assignedUserId) : true;
                const shouldPause = holiday || !inShift;

                // --- 1. SLA Pause / Resume (Offset ETR) ---
                if (shouldPause && !ticket.sla_paused) {
                    await pool.query(
                        `UPDATE tickets SET sla_paused=1, sla_paused_at=NOW() WHERE id=?`,
                        [ticket.id]
                    );
                    logger.info(`[SLA Engine] ⏸ Ticket #${ticket.ticket_number} paused.`);
                    continue;
                }

                if (!shouldPause && ticket.sla_paused && ticket.sla_paused_at) {
                    const pausedDuration = nowMoment.diff(moment(ticket.sla_paused_at).tz(TZ), "minutes");
                    await pool.query(
                        `UPDATE tickets SET sla_paused=0, sla_paused_at=NULL,
                         etr = DATE_ADD(etr, INTERVAL ? MINUTE)
                         WHERE id=?`,
                        [pausedDuration, ticket.id]
                    );
                    logger.info(`[SLA Engine] ▶ Ticket #${ticket.ticket_number} resumed. ETR +${pausedDuration}m.`);
                }

                if (shouldPause) continue;

                // --- 2. Dynamic Escalation Check ---
                // Resolution Order: Customer > Project > Priority
                const policy = await getEffectiveTicketSLA(pool, { 
                    customerId: ticket.customer_id, 
                    projectId: ticket.project_id, 
                    priority: ticket.priority 
                });
                
                const modifier = await getQueueModifier(pool, ticket.queue_id);
                const escMult = modifier?.escalation_multiplier || 1.0;

                const thresholds = {
                    1: (policy.escalation_1_min || 60) * escMult,
                    2: (policy.escalation_2_min || 120) * escMult,
                    3: (policy.escalation_3_min || 180) * escMult
                };

                const createdAt = moment(ticket.created_at).tz(TZ);
                const elapsedMinutes = nowMoment.diff(createdAt, "minutes");
                const currentLevel = ticket.escalation_level; // e.g., 1
                const nextThreshold = thresholds[currentLevel];

                // If elapsed time exceeds threshold for CURRENT level, move to NEXT level
                if (nextThreshold && elapsedMinutes >= nextThreshold) {
                    const newLevel = currentLevel + 1;
                    const nextAssigneeId = await findNextAssignee(pool, assignedUserId);

                    await pool.query(
                        `UPDATE tickets SET escalation_level=?, assigned_to=COALESCE(?, assigned_to) WHERE id=?`,
                        [newLevel, nextAssigneeId, ticket.id]
                    );

                    await pool.query(
                        `INSERT INTO escalation_logs (ticket_id, from_user_id, to_user_id, escalation_level, reason, escalated_at)
                         VALUES (?,?,?,?,?,NOW())`,
                        [ticket.id, assignedUserId, nextAssigneeId, newLevel,
                        `Dynamic escalation triggered at ${elapsedMinutes}m (threshold: ${nextThreshold}m)`]
                    );

                    await pool.query(
                        `INSERT INTO ticket_activities (ticket_id, action, note) VALUES (?, 'auto_escalated', ?)`,
                        [ticket.id, `Escalated to Level ${newLevel}. Elapsed: ${elapsedMinutes}m.`]
                    );

                    logger.info(`[SLA Engine] 🔺 Ticket #${ticket.ticket_number} escalated to Level ${newLevel}`);
                }
                
                // --- 3. Final Resolution Breach Check ---
                const etr = moment(ticket.etr).tz(TZ);
                if (nowMoment.isAfter(etr) && ticket.sla_state !== 'breached') {
                    await pool.query(`UPDATE tickets SET sla_state='breached' WHERE id=?`, [ticket.id]);
                    logger.warn(`[SLA Engine] ⚠️ Ticket #${ticket.ticket_number} has BREACHED SLA!`);
                    
                    // Trigger breach notifications or webhooks if needed
                }

            } catch (ticketErr) {
                logger.error(`[SLA Engine] Error processing ticket ${ticket.id}: ${ticketErr.message}`);
            }
        }
    } catch (err) {
        logger.error(`[SLA Engine] Fatal error: ${err.message}`);
    }
}

export function startSLAEngine() {
    const interval = process.env.SLA_CRON_INTERVAL || "*/5 * * * *";
    logger.info(`[SLA Engine] Initializing with interval: "${interval}"`);
    cron.schedule(interval, runSLAEngine, { timezone: TZ });

    // Initial run
    runSLAEngine();
}
