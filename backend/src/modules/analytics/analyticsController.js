// src/modules/analytics/analyticsController.js
import connectDB from "../../db/index.js";

/**
 * GET summary statistics
 */
export const getDashboardSummary = async (req, res) => {
    try {
        const pool = connectDB();
        const { startDate, endDate, customerId, projectId } = req.query;
        
        let filter = "1=1";
        const rp = [];
        if (startDate) { filter += " AND created_at >= ?"; rp.push(startDate); }
        if (endDate) { filter += " AND created_at <= ?"; rp.push(endDate); }
        if (customerId) { filter += " AND customer_id = ?"; rp.push(customerId); }
        if (projectId) { filter += " AND project_id = ?"; rp.push(projectId); }

        const [counts] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
                SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
                SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
                SUM(CASE WHEN sla_state = 'breached' THEN 1 ELSE 0 END) as breached
            FROM tickets WHERE ${filter}
        `, rp);

        const [perf] = await pool.query(`
            SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at)) as avg_hours
            FROM tickets 
            WHERE status IN ('resolved', 'closed') AND resolved_at IS NOT NULL AND ${filter}
        `, rp);

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

export const getTicketTrends = async (req, res) => {
    try {
        const pool = connectDB();
        const { days = 14, customerId, projectId } = req.query;
        
        let filter = "created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)";
        const rp = [parseInt(days)];
        if (customerId) { filter += " AND customer_id = ?"; rp.push(customerId); }
        if (projectId) { filter += " AND project_id = ?"; rp.push(projectId); }

        const [rows] = await pool.query(`
            SELECT 
                DATE_FORMAT(created_at, '%Y-%m-%d') as date,
                COUNT(*) as incoming,
                SUM(CASE WHEN status IN ('resolved', 'closed') THEN 1 ELSE 0 END) as resolved
            FROM tickets
            WHERE ${filter}
            GROUP BY date
            ORDER BY date ASC
        `, rp);

        return res.json({ success: true, trends: rows });
    } catch (err) {
        console.error("getTicketTrends:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const getSLAStatus = async (req, res) => {
    try {
        const pool = connectDB();
        const { customerId, projectId } = req.query;
        let filter = "1=1";
        const rp = [];
        if (customerId) { filter += " AND customer_id = ?"; rp.push(customerId); }
        if (projectId) { filter += " AND project_id = ?"; rp.push(projectId); }

        const [rows] = await pool.query(`
            SELECT 
                priority,
                COUNT(*) as total,
                SUM(CASE WHEN sla_state = 'completed' THEN 1 ELSE 0 END) as met,
                SUM(CASE WHEN sla_state = 'breached' THEN 1 ELSE 0 END) as breached
            FROM tickets
            WHERE ${filter}
            GROUP BY priority
            ORDER BY priority ASC
        `, rp);

        return res.json({ success: true, sla: rows });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const getAgentPerformance = async (req, res) => {
    try {
        const pool = connectDB();
        const { startDate, endDate } = req.query;
        let filter = "t.status IN ('resolved', 'closed') AND t.resolved_at IS NOT NULL";
        const rp = [];
        if (startDate) { filter += " AND t.resolved_at >= ?"; rp.push(startDate); }
        if (endDate) { filter += " AND t.resolved_at <= ?"; rp.push(endDate); }

        const [rows] = await pool.query(`
            SELECT 
                u.id, 
                u.name,
                COUNT(t.id) as tickets_resolved,
                AVG(TIMESTAMPDIFF(HOUR, t.created_at, t.resolved_at)) as avg_resolution_hours
            FROM users u
            JOIN tickets t ON u.id = t.assigned_to
            WHERE ${filter}
            GROUP BY u.id, u.name
            ORDER BY tickets_resolved DESC
            LIMIT 10
        `, rp);

        return res.json({ success: true, agents: rows });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const getSourceDistribution = async (req, res) => {
    try {
        const pool = connectDB();
        const { customerId, projectId } = req.query;
        let filter = "1=1";
        const rp = [];
        if (customerId) { filter += " AND customer_id = ?"; rp.push(customerId); }
        if (projectId) { filter += " AND project_id = ?"; rp.push(projectId); }

        const [rows] = await pool.query(`
            SELECT source, COUNT(*) as count
            FROM tickets
            WHERE ${filter}
            GROUP BY source
        `, rp);
        return res.json({ success: true, distribution: rows });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Server error" });
    }
};
