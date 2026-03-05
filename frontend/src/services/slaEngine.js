// src/services/slaEngine.js
/**
 * SLA Engine – Cron job that runs every 5 minutes.
 * 
 * Logic:
 * 1. Fetch all open/in_progress tickets
 * 2. For each ticket, check if current time is in active shift window
 * 3. If outside shift or holiday → pause SLA
 * 4. If inside shift and SLA was paused → resume, add paused duration to ETR
 * 5. Calculate effective elapsed time (excluding paused durations)
 * 6. Escalate if threshold crossed
 * 7. Log escalation
 */
import cron from "node-cron";
import moment from "moment-timezone";
import connectDB from "../db/index.js";
import { ESCALATION_THRESHOLDS } from "../constants.js";
import { logger } from "../logger.js";

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
    const dayAbbr = moment().tz(TZ).format("ddd"); // Mon, Tue …
    const curTime = moment().tz(TZ).format("HH:mm:ss");

    const [shifts] = await pool.query(
        `SELECT s.start_time, s.end_time, s.working_days
     FROM shifts s
     JOIN shift_members sm ON sm.shift_id = s.id
     WHERE sm.user_id = ?`,
        [userId]
    );

    for (const shift of shifts) {
        let workDays;
        try { workDays = JSON.parse(shift.working_days); } catch { workDays = []; }
        if (!workDays.includes(dayAbbr)) continue;
        if (curTime >= shift.start_time && curTime <= shift.end_time) return true;
    }
    return false;
}

// Find the next escalation target user based on current assignee
async function findNextAssignee(pool, currentAssigneeId) {
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

        // Fetch all active tickets
        const [tickets] = await pool.query(
            `SELECT t.*, u.reporting_to as manager_id
       FROM tickets t
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.status IN ('open', 'in_progress') AND t.escalation_level < 4`
        );

        logger.info(`[SLA Engine] Running check on ${tickets.length} active tickets`);

        for (const ticket of tickets) {
            try {
                const assignedUserId = ticket.assigned_to;
                const inShift = assignedUserId ? await isWithinShift(pool, assignedUserId) : true;
                const shouldPause = holiday || !inShift;

                // --- SLA Pause / Resume Logic ---
                if (shouldPause && !ticket.sla_paused) {
                    // Pause SLA
                    await pool.query(
                        `UPDATE tickets SET sla_paused=1, sla_paused_at=NOW() WHERE id=?`,
                        [ticket.id]
                    );
                    logger.info(`[SLA Engine] ⏸ Ticket #${ticket.ticket_number} SLA paused (holiday=${holiday}, inShift=${inShift})`);
                    continue; // No escalation while paused
                }

                if (!shouldPause && ticket.sla_paused && ticket.sla_paused_at) {
                    // Resume: calculate paused duration and push ETR forward
                    const pausedDuration = nowMoment.diff(moment(ticket.sla_paused_at).tz(TZ), "minutes");
                    await pool.query(
                        `UPDATE tickets SET sla_paused=0, sla_paused_at=NULL,
             etr = DATE_ADD(etr, INTERVAL ? MINUTE)
             WHERE id=?`,
                        [pausedDuration, ticket.id]
                    );
                    logger.info(`[SLA Engine] ▶ Ticket #${ticket.ticket_number} SLA resumed. ETR extended by ${pausedDuration} mins.`);
                }

                if (shouldPause) continue; // Still paused

                // --- Escalation Check ---
                const createdAt = moment(ticket.created_at).tz(TZ);
                const elapsedMinutes = nowMoment.diff(createdAt, "minutes");
                const threshold = ESCALATION_THRESHOLDS[ticket.escalation_level];

                if (!threshold) continue; // Level 4 — no more escalation

                if (elapsedMinutes >= threshold) {
                    const newLevel = ticket.escalation_level + 1;
                    const nextAssigneeId = await findNextAssignee(pool, assignedUserId);

                    await pool.query(
                        `UPDATE tickets SET escalation_level=?, assigned_to=COALESCE(?,assigned_to) WHERE id=?`,
                        [newLevel, nextAssigneeId, ticket.id]
                    );

                    await pool.query(
                        `INSERT INTO escalation_logs (ticket_id, from_user_id, to_user_id, escalation_level, reason, escalated_at)
             VALUES (?,?,?,?,?,NOW())`,
                        [ticket.id, assignedUserId, nextAssigneeId, newLevel,
                        `Auto-escalated after ${elapsedMinutes} min (threshold: ${threshold} min)`]
                    );

                    await pool.query(
                        `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,?,?,?)`,
                        [ticket.id, "auto_escalated", null,
                        `Auto-escalated to Level ${newLevel} (elapsed: ${elapsedMinutes} min)`]
                    );

                    logger.info(`[SLA Engine] 🔺 Ticket #${ticket.ticket_number} escalated → Level ${newLevel}`);
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
    logger.info(`[SLA Engine] Starting with cron: "${interval}"`);
    cron.schedule(interval, runSLAEngine, { timezone: TZ });

    // Run immediately on startup
    runSLAEngine();
}
