// src/modules/analytics/analyticsController.js
import connectDB from "../../db/index.js";

/**
 * GET summary statistics
 */
export const getDashboardSummary = async (req, res) => {
    try {
        const pool = connectDB();
        
        // 1. Basic counts
        const [counts] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
                SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
                SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
                SUM(CASE WHEN sla_state = 'breached' THEN 1 ELSE 0 END) as breached
            FROM tickets
        `);

        // 2. Performance (Avg Days to resolve)
        const [perf] = await pool.query(`
            SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at)) as avg_hours
            FROM tickets 
            WHERE status IN ('resolved', 'closed') AND resolved_at IS NOT NULL
        `);

        return res.json({
            success: true,
            summary: {
                ...counts[0],
                avg_resolution_hours: Math.round(perf[0].avg_hours || 0)
            }
        });
    } catch (err) {
        console.error("getDashboardSummary:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * GET ticket trends (Last 14 days)
 */
export const getTicketTrends = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(`
            SELECT 
                DATE_FORMAT(created_at, '%Y-%m-%d') as date,
                COUNT(*) as incoming,
                SUM(CASE WHEN status IN ('resolved', 'closed') THEN 1 ELSE 0 END) as resolved
            FROM tickets
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
            GROUP BY date
            ORDER BY date ASC
        `);

        return res.json({ success: true, trends: rows });
    } catch (err) {
        console.error("getTicketTrends:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * GET SLA compliance by priority
 */
export const getSLAStatus = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(`
            SELECT 
                priority,
                COUNT(*) as total,
                SUM(CASE WHEN sla_state = 'completed' THEN 1 ELSE 0 END) as met,
                SUM(CASE WHEN sla_state = 'breached' THEN 1 ELSE 0 END) as breached
            FROM tickets
            GROUP BY priority
            ORDER BY priority ASC
        `);

        return res.json({ success: true, sla: rows });
    } catch (err) {
        console.error("getSLAStatus:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * GET agent performance leaderboard
 */
export const getAgentPerformance = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(`
            SELECT 
                u.id, 
                u.name,
                COUNT(t.id) as tickets_resolved,
                AVG(TIMESTAMPDIFF(HOUR, t.created_at, t.resolved_at)) as avg_resolution_hours
            FROM users u
            JOIN tickets t ON u.id = t.assigned_to
            WHERE t.status IN ('resolved', 'closed') AND t.resolved_at IS NOT NULL
            GROUP BY u.id, u.name
            ORDER BY tickets_resolved DESC
            LIMIT 10
        `);

        return res.json({ success: true, agents: rows });
    } catch (err) {
        console.error("getAgentPerformance:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

/**
 * GET source distribution
 */
export const getSourceDistribution = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(`
            SELECT source, COUNT(*) as count
            FROM tickets
            GROUP BY source
        `);
        return res.json({ success: true, distribution: rows });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Server error" });
    }
};
