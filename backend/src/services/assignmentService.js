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
        const currentDay = now.format('ddd').toUpperCase(); // SUN, MON, TUE...

        // 1. Identify active shifts covering this time and day
        // Logic for overnight shifts (e.g. 22:00 to 06:00):
        // (start < end AND now BETWEEN start AND end) OR (start > end AND (now >= start OR now <= end))
        const [shifts] = await pool.query(
            `SELECT id FROM agent_shifts 
             WHERE is_active = 1 
               AND FIND_IN_SET(?, REPLACE(days_of_week, ' ', '')) > 0
               AND (
                 (start_time <= end_time AND ? BETWEEN start_time AND end_time)
                 OR 
                 (start_time > end_time AND (? >= start_time OR ? <= end_time))
               )`,
            [currentDay, currentTime, currentTime, currentTime]
        );

        if (!shifts.length) {
            logger.info(`[Assignment] No active shift found for ${currentDay} ${currentTime}`);
            return null;
        }

        const shiftIds = shifts.map(s => s.id);

        // 2. Fetch all agents assigned to these shifts
        // We calculate their "Load" (count of open/in_progress tickets) in the same query.
        const [agents] = await pool.query(
            `SELECT u.id, u.name, u.is_online,
                    (SELECT COUNT(*) FROM tickets t WHERE t.assigned_to = u.id AND t.status IN ('open', 'in_progress')) as load_count
             FROM users u
             JOIN user_shifts us ON us.user_id = u.id
             WHERE us.shift_id IN (?) AND u.role = 'agent' AND u.is_active = 1`,
            [shiftIds]
        );

        if (!agents.length) {
            logger.info(`[Assignment] No active agents found in shift(s): ${shiftIds.join(',')}`);
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
