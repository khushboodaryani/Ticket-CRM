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
export const getShiftAssignee = async (queueId = null, priority = 'P3') => {
    const pool = connectDB();
    
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
            if (Array.isArray(s.working_days)) {
                days = s.working_days;
            } else {
                try { days = JSON.parse(s.working_days); } catch { return false; }
            }
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

        // 2. Identify eligible agents: Linked to active shifts AND linked to the Queue (if provided)
        let query = `
            SELECT u.id, u.name, u.is_online,
                (SELECT COUNT(*) FROM tickets t WHERE t.assigned_to = u.id AND t.status IN ('open', 'in_progress')) as load_count
            FROM users u
            JOIN shift_members sm ON sm.user_id = u.id
        `;
        
        const params = [activeShiftIds];
        
        if (queueId) {
            query += ` JOIN queue_agents qa ON qa.user_id = u.id `;
        }
        
        query += ` 
            WHERE sm.shift_id IN (?) 
            AND u.role IN ('agent', 'tl') 
            AND u.is_active = 1 
            AND u.is_online = 1
            AND u.last_heartbeat > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
        `;
        
        if (queueId) {
            query += ` AND qa.queue_id = ? `;
            params.push(queueId);
        }

        const [agents] = await pool.query(query, params);

        if (!agents.length) {
            logger.info(`[Assignment] No active/online agents found in shift(s): ${activeShiftIds.join(',')}`);
            return null;
        }

        // 3. Final candidates (No offline fallback)
        const candidates = agents;

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
