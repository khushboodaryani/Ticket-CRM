// src/services/assignmentService.js
import connectDB from '../db/index.js';
import { logger } from '../logger.js';
import moment from 'moment-timezone';

const TZ = process.env.TIMEZONE || 'Asia/Kolkata';

/**
 * Finds the most suitable agent for automatic ticket assignment based on:
 * 1. Current Shift (Availability)
 * 2. Real-time Online Status (Presence)
 * 3. Ticket Load (Fair balancing)
 */
export const getShiftAssignee = async (priority = 'P3') => {
    const pool = connectDB();
    
    // Emergency P1 tickets often skip auto-assignment to trigger global broadcasts
    // but if requested, we can still provide a suggestion.
    // For this implementation, we follow the user requirement for shift auto-assign.

    try {
        const now = moment().tz(TZ);
        const currentTime = now.format('HH:mm:ss');
        const currentDay = now.format('ddd'); // Mon, Tue...

        // 1. Identify active shifts for the current time/day
        const [allShifts] = await pool.query(
            `SELECT id, start_time, end_time, working_days FROM shifts`
        );

        const activeShiftIds = allShifts.filter(s => {
            let days = [];
            try { days = JSON.parse(s.working_days); } catch { return false; }
            if (!days.includes(currentDay)) return false;

            const { start_time: start, end_time: end } = s;
            if (start <= end) {
                return (currentTime >= start && currentTime <= end);
            } else {
                return (currentTime >= start || currentTime <= end);
            }
        }).map(s => s.id);

        if (activeShiftIds.length === 0) {
            logger.info(`[Assignment] No active shifts found for ${currentDay} at ${currentTime}`);
            return null;
        }

        // 2. Identify all agents linked to these active shifts
        const [agents] = await pool.query(
            `SELECT u.id, u.name, u.is_online,
                (SELECT COUNT(*) FROM tickets t WHERE t.assigned_to = u.id AND t.status IN ('open', 'in_progress')) as load_count
             FROM users u
             JOIN shift_members sm ON sm.user_id = u.id
             WHERE sm.shift_id IN (?) AND u.role = 'agent' AND u.is_active = 1`,
            [activeShiftIds]
        );

        if (!agents.length) {
            logger.info(`[Assignment] No active agents found in shift(s): ${activeShiftIds.join(',')}`);
            return null;
        }

        // 3. Prioritize Online agents
        const onlineAgents = agents.filter(a => a.is_online === 1);
        const candidates = onlineAgents.length > 0 ? onlineAgents : agents;

        // 4. Pick the Least-Loaded candidate
        // Sort by load_count ascending, then randomly if equal load to distribute fairly
        candidates.sort((a, b) => {
            if (a.load_count !== b.load_count) return a.load_count - b.load_count;
            return Math.random() - 0.5;
        });

        const chosen = candidates[0];
        logger.info(`[Assignment] Auto-assigned to ${chosen.name} (Load: ${chosen.load_count}, Online: ${chosen.is_online})`);
        
        return chosen.id;

    } catch (err) {
        logger.error(`[Assignment] System error: ${err.message}`);
        return null;
    }
};
