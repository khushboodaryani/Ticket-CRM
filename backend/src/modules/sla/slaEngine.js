// modules/sla/slaEngine.js
/**
 * SLA Engine – Cron job that runs every 5 minutes.
 * Enhanced: updates sla_state to 'breached' and creates in-app notifications.
 */
import cron from "node-cron";
import moment from "moment-timezone";
import connectDB from "../../db/index.js";
import { logger } from "../../logger.js";
import { createNotification } from "../notifications/notificationController.js";

const TZ = process.env.TIMEZONE || "Asia/Kolkata";
const ESCALATION_ROLE_BY_LEVEL = {
    1: "agent",
    2: "tl",
    3: "manager",
    4: "gm",
};

async function isHoliday(pool, dateStr) {
    const [rows] = await pool.query(
        `SELECT id FROM holidays WHERE holiday_date = ? LIMIT 1`,
        [dateStr]
    );
    return rows.length > 0;
}

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
        let workDays;
        try { workDays = JSON.parse(shift.working_days); } catch { workDays = []; }
        if (!workDays.includes(dayAbbr)) continue;
        if (curTime >= shift.start_time && curTime <= shift.end_time) return true;
    }
    // If user has NO assigned shifts, default to TRUE to avoid indefinite pausing
    return shifts.length === 0;
}

async function resolveEscalationAssignee(pool, currentAssigneeId, targetLevel) {
    if (!currentAssigneeId) return null;

    const targetRole = ESCALATION_ROLE_BY_LEVEL[targetLevel];
    const seen = new Set();
    let cursor = currentAssigneeId;
    let fallback = null;

    while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        const [rows] = await pool.query(
            `SELECT id, role, reporting_to, is_active
             FROM users
             WHERE id = ?
             LIMIT 1`,
            [cursor]
        );
        const user = rows[0];
        if (!user) break;

        if (user.id !== currentAssigneeId && user.is_active) {
            fallback = user.id;
            if (!targetRole || user.role === targetRole) {
                return user.id;
            }
        }

        cursor = user.reporting_to || null;
    }

    return fallback;
}

async function runSLAEngine() {
    const pool = connectDB();
    const todayStr = moment().tz(TZ).format("YYYY-MM-DD");
    const nowMoment = moment().tz(TZ);

    try {
        const holiday = await isHoliday(pool, todayStr);

        let tickets;
        const [rows] = await pool.query(
            `SELECT
               t.*,
               sp.escalation_1_min AS eff_escalation_1_min,
               sp.escalation_2_min AS eff_escalation_2_min,
               sp.escalation_3_min AS eff_escalation_3_min
             FROM tickets t
             LEFT JOIN sla_policies_new sp ON sp.id = t.sla_policy_id
             WHERE t.status IN ('open', 'in_progress') AND t.escalation_level < 4`
        );
        tickets = rows;

        logger.info(`[SLA Engine] Running check on ${tickets.length} active tickets`);

        for (const ticket of tickets) {
            try {
                const hasPolicy = ticket.eff_escalation_1_min || ticket.eff_escalation_2_min || ticket.eff_escalation_3_min;
                if (!hasPolicy) {
                    logger.warn(`[SLA Engine] No SLA policy for priority ${ticket.priority}`);
                    continue;
                }
                if (ticket.sla_paused_manual === 1) {
                    continue; // Skip automatic intervals if manual override is lock
                }

                const assignedUserId = ticket.assigned_to;
                const inShift = assignedUserId ? await isWithinShift(pool, assignedUserId) : true;
                const shouldPause = holiday || !inShift;

                // --- SLA Pause / Resume Logic ---
                if (shouldPause && !ticket.sla_paused) {
                    await pool.query(
                        `UPDATE tickets SET sla_paused=1, sla_paused_at=NOW() WHERE id=?`,
                        [ticket.id]
                    );
                    logger.info(`[SLA Engine] ⏸ Ticket #${ticket.ticket_number} SLA paused`);
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
                    logger.info(`[SLA Engine] ▶ Ticket #${ticket.ticket_number} SLA resumed. ETR extended by ${pausedDuration} mins.`);
                }

                if (shouldPause) continue;

                // --- Escalation Check ---
                const createdAt = moment(ticket.created_at).tz(TZ);
                const elapsedMinutes = nowMoment.diff(createdAt, "minutes");
                const threshold = ticket[`eff_escalation_${ticket.escalation_level}_min`];

                if (!threshold) continue;

                if (elapsedMinutes >= threshold) {
                    const newLevel = ticket.escalation_level + 1;
                    const nextAssigneeId = await resolveEscalationAssignee(pool, assignedUserId, newLevel);

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

                    // Notify new assignee about escalation
                    if (nextAssigneeId) {
                        await createNotification(pool, {
                            user_id: nextAssigneeId,
                            type: 'ticket_assigned',
                            title: `Ticket Escalated to You: ${ticket.ticket_number}`,
                            body: `Ticket ${ticket.ticket_number} has been escalated to Level ${newLevel} and assigned to you.`,
                            entity_id: ticket.id
                        });
                    }

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
    runSLAEngine();
}
