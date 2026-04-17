// src/modules/dashboard/monitoringController.js
import connectDB from "../../db/index.js";
import { logger } from "../../logger.js";

/**
 * GET /api/monitoring/snapshot
 * Fetches the complete state for dashboard rehydration
 */
export const getSnapshot = async (req, res) => {
    try {
        const pool = connectDB();
        const { role } = req.user;

        if (role !== 'superadmin' && role !== 'manager' && role !== 'gm') {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const n = (val) => { const v = parseInt(val); return isNaN(v) ? 0 : v; };

        // 1. Overall Summary
        const [overall] = await pool.query(
            `SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open_count,
                SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as inprogress_count,
                SUM(CASE WHEN sla_state='breached' THEN 1 ELSE 0 END) as breached_count,
                SUM(CASE WHEN etr < NOW() AND status NOT IN ('resolved','closed') THEN 1 ELSE 0 END) as overdue_count
            FROM tickets`
        );

        // 2. Queue Health + Reference List
        const [queues] = await pool.query(
            `SELECT q.id, q.name, 
                COUNT(t.id) as total_tickets,
                SUM(CASE WHEN t.status IN ('open','in_progress') THEN 1 ELSE 0 END) as active_tickets,
                SUM(CASE WHEN t.sla_state = 'active' THEN 1 ELSE 0 END) as within_sla,
                (SELECT COUNT(*) FROM queue_agents qa WHERE qa.queue_id = q.id) as agent_count
             FROM queues q
             LEFT JOIN tickets t ON t.queue_id = q.id
             GROUP BY q.id, q.name`
        );

        // 3. Agent Presence
        const [agents] = await pool.query(
            `SELECT id, name, extension, status, is_online, last_heartbeat
             FROM users 
             WHERE role IN ('agent', 'tl')
             ORDER BY is_online DESC, name ASC`
        );

        // 4. Kanban Snapshot (Enriched for Mega-Filters)
        const [kanban] = await pool.query(
            `SELECT t.id, t.ticket_number, t.priority, t.status, t.etr, t.assigned_to,
                t.source, t.category, t.escalation_level as level,
                u.name as assigned_to_name,
                sm.shift_id as assigned_to_shift_id,
                q.name as queue_name,
                c.name as customer_name,
                t.created_at
             FROM tickets t
             LEFT JOIN users u ON t.assigned_to = u.id
             LEFT JOIN shift_members sm ON t.assigned_to = sm.user_id
             LEFT JOIN queues q ON t.queue_id = q.id
             LEFT JOIN customers c ON t.customer_id = c.id
             WHERE t.status NOT IN ('resolved', 'closed')
             ORDER BY 
                CASE WHEN t.etr < NOW() THEN 0 
                     WHEN t.etr < (NOW() + INTERVAL 1 HOUR) THEN 1 
                     ELSE 2 END,
                FIELD(t.priority, 'P1', 'P2', 'P3', 'P4', 'P5')
             LIMIT 150` 
        );

        // EXTRA: Filter Metadata
        const [sources] = await pool.query(`SELECT DISTINCT source FROM tickets WHERE source IS NOT NULL`);
        const [categories] = await pool.query(`SELECT DISTINCT category FROM tickets WHERE category IS NOT NULL`);

        // 5. Shift-wise Performance
        const [shifts] = await pool.query(
            `SELECT s.id, s.name, s.start_time, s.end_time,
                (SELECT COUNT(*) FROM shift_members sm WHERE sm.shift_id = s.id) as manpower_available,
                (SELECT COUNT(*) FROM tickets t WHERE t.status IN ('open', 'in_progress')) as total_active_tickets,
                (SELECT COUNT(*) FROM tickets t WHERE t.sla_state = 'breached' AND t.status NOT IN ('resolved','closed')) as breached_tickets
             FROM shifts s`
        );

        const shiftMetrics = shifts.map(s => {
            const needed = Math.ceil(s.total_active_tickets / 5);
            const staffingGap = needed - s.manpower_available;
            let health = 'healthy';
            let reason = 'Normal Operations';
            if (s.breached_tickets > 0) { health = 'critical'; reason = `${s.breached_tickets} SLA Breaches`; }
            else if (staffingGap > 2) { health = 'critical'; reason = `Severely Understaffed (-${staffingGap})`; }
            else if (staffingGap > 0) { health = 'warning'; reason = `Capacity Warning (-${staffingGap})`; }
            return { ...s, manpower_needed: needed, health, health_reason: reason };
        });

        // 6. Trends
        const [trends] = await pool.query(
            `SELECT HOUR(created_at) as hour, COUNT(*) as count FROM tickets WHERE created_at > (NOW() - INTERVAL 24 HOUR) GROUP BY HOUR(created_at) ORDER BY hour ASC`
        );

        return res.json({
            success: true,
            snapshot: {
                summary: overall[0],
                queues: queues.map(q => ({ ...q, health: q.active_tickets > (q.agent_count * 5) ? 'critical' : (q.active_tickets > (q.agent_count * 3) ? 'warning' : 'healthy') })),
                agents,
                kanban,
                shiftMetrics,
                trends,
                filterOptions: {
                    queues: queues.map(q => ({ id: q.id, name: q.name })),
                    sources: sources.map(s => s.source),
                    categories: categories.map(c => c.category),
                    levels: [1, 2, 3] // Standard levels
                },
                server_ts: Date.now()
            }
        });


    } catch (err) {
        logger.error(`[MonitoringSnapshot] Error: ${err.message}`);
        return res.status(500).json({ success: false, message: "Snapshot failed" });
    }
};

/**
 * GET /api/monitoring/queue/:id/detail
 * Returns live agents and tickets for a specific queue
 */
export const getQueueDetail = async (req, res) => {
    try {
        const pool = connectDB();
        const { id } = req.params;

        // 1. Agents in this queue
        const [agents] = await pool.query(
            `SELECT u.id, u.name, u.status, u.is_online, u.extension
             FROM queue_agents qa
             JOIN users u ON qa.user_id = u.id
             WHERE qa.queue_id = ?`,
            [id]
        );

        // 2. Active tickets in this queue
        const [tickets] = await pool.query(
            `SELECT t.id, t.ticket_number, t.subject, t.priority, t.status, t.etr, 
                t.source, t.category, t.escalation_level as level,
                u.name as assigned_to_name,
                c.name as customer_name
             FROM tickets t
             LEFT JOIN users u ON t.assigned_to = u.id
             LEFT JOIN customers c ON t.customer_id = c.id
             WHERE t.queue_id = ? AND t.status NOT IN ('resolved', 'closed')
             ORDER BY t.created_at DESC
             LIMIT 100`,
            [id]
        );

        return res.json({ success: true, agents, tickets });
    } catch (err) {
        logger.error(`[QueueDetail] Error: ${err.message}`);
        return res.status(500).json({ success: false, message: "Failed to fetch queue details" });
    }
};

/**
 * GET /api/monitoring/agent/:id/detail
 * Returns current activity and performance for an agent
 */
export const getAgentDetail = async (req, res) => {
    try {
        const pool = connectDB();
        const { id } = req.params;

        // 1. Agent basic info + current status
        const [agent] = await pool.query(
            `SELECT id, name, extension, status, is_online, last_heartbeat FROM users WHERE id = ?`,
            [id]
        );

        // 2. Current active ticket
        const [tickets] = await pool.query(
            `SELECT id, ticket_number, subject, priority, created_at, etr
             FROM tickets 
             WHERE assigned_to = ? AND status = 'in_progress'
             LIMIT 1`,
            [id]
        );

        // 3. Stats (Tickets closed today)
        const [stats] = await pool.query(
            `SELECT COUNT(*) as closed_today 
             FROM tickets 
             WHERE assigned_to = ? AND status IN ('resolved','closed') 
             AND updated_at > CURDATE()`,
            [id]
        );

        return res.json({ 
            success: true, 
            agent: agent[0], 
            activeTicket: tickets[0] || null,
            stats: stats[0] 
        });
    } catch (err) {
        logger.error(`[AgentDetail] Error: ${err.message}`);
        return res.status(500).json({ success: false, message: "Failed to fetch agent details" });
    }
};

/**
 * GET /api/monitoring/shift/:id/detail
 * Returns all members of a shift and their current load
 */
export const getShiftDetail = async (req, res) => {
    try {
        const pool = connectDB();
        const { id } = req.params;

        const [members] = await pool.query(
            `SELECT u.id, u.name, u.status, u.is_online,
                (SELECT COUNT(*) FROM tickets t WHERE t.assigned_to = u.id AND t.status IN ('open','in_progress')) as active_tickets
             FROM shift_members sm
             JOIN users u ON sm.user_id = u.id
             WHERE sm.shift_id = ?`,
            [id]
        );

        return res.json({ success: true, members });
    } catch (err) {
        logger.error(`[ShiftDetail] Error: ${err.message}`);
        return res.status(500).json({ success: false, message: "Failed to fetch shift details" });
    }
};

