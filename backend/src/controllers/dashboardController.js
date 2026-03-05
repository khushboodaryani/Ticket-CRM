// src/controllers/dashboardController.js
import connectDB from "../db/index.js";

// Role labels for API response context
const ROLE_SCOPE = {
    superadmin: "All system tickets",
    gm: "Tickets at escalation level 3+",
    manager: "Tickets at escalation level 2+",
    tl: "Your team's tickets",
    agent: "Your assigned tickets",
};

// GET /api/dashboard
export const getDashboard = async (req, res) => {
    try {
        const pool = connectDB();
        const { role, userId } = req.user;

        // Role-based ticket scope
        let roleFilter = "1=1";
        const rp = [];
        if (role === "agent") {
            roleFilter = "t.assigned_to = ?";
            rp.push(userId);
        } else if (role === "tl") {
            roleFilter = "t.assigned_to IN (SELECT id FROM users WHERE reporting_to = ? OR id = ?)";
            rp.push(userId, userId);
        } else if (role === "manager") {
            roleFilter = "t.escalation_level >= 2";
        } else if (role === "gm") {
            roleFilter = "t.escalation_level >= 3";
        }
        // superadmin: 1=1 (all tickets)

        // Helper to safely parse numbers
        const n = (val) => {
            const v = parseInt(val);
            return isNaN(v) ? 0 : v;
        };

        // 1. Overall summary counts
        const [overall] = await pool.query(
            `SELECT
                COUNT(*) as total,
                SUM(CASE WHEN t.status='open' THEN 1 ELSE 0 END) as open_count,
                SUM(CASE WHEN t.status='in_progress' THEN 1 ELSE 0 END) as inprogress_count,
                SUM(CASE WHEN t.status='resolved' THEN 1 ELSE 0 END) as resolved_count,
                SUM(CASE WHEN t.status='closed' THEN 1 ELSE 0 END) as closed_count,
                SUM(CASE WHEN t.escalation_level > 1 THEN 1 ELSE 0 END) as escalated_count,
                SUM(CASE WHEN t.etr < NOW() AND t.status NOT IN ('resolved','closed') THEN 1 ELSE 0 END) as overdue_count
            FROM tickets t WHERE ${roleFilter}`,
            rp
        );

        // 2. Priority breakdown
        const [priority] = await pool.query(
            `SELECT priority, COUNT(*) as count FROM tickets t WHERE ${roleFilter} GROUP BY priority ORDER BY priority`,
            rp
        );

        // 3. Escalation level breakdown
        const [escalations] = await pool.query(
            `SELECT escalation_level, COUNT(*) as count FROM tickets t WHERE ${roleFilter} GROUP BY escalation_level ORDER BY escalation_level`,
            rp
        );

        // 4. Status breakdown
        const [statusBreakdown] = await pool.query(
            `SELECT status, COUNT(*) as count FROM tickets t WHERE ${roleFilter} GROUP BY status`,
            rp
        );

        // 5. Source breakdown (email, phone, manual, csv)
        const [sourceBreakdown] = await pool.query(
            `SELECT COALESCE(source, 'manual') as source, COUNT(*) as count 
             FROM tickets t WHERE ${roleFilter} GROUP BY source`,
            rp
        );

        // 6. Customer-wise open tickets (role-scoped)
        const [customerWise] = await pool.query(
            `SELECT c.id, c.name as customer_name, c.customer_code,
                COUNT(t.id) as total_tickets,
                SUM(CASE WHEN t.status IN ('open','in_progress') THEN 1 ELSE 0 END) as open_tickets
             FROM customers c
             LEFT JOIN tickets t ON t.customer_id = c.id AND ${roleFilter}
             GROUP BY c.id, c.name, c.customer_code
             ORDER BY open_tickets DESC, total_tickets DESC
             LIMIT 10`,
            rp
        );

        // 7. Recent escalation logs
        const [recentEscalations] = await pool.query(
            `SELECT el.id, el.escalation_level as new_level, el.escalated_at,
                t.ticket_number, p.name as project_name,
                fu.name as from_name, tu.name as to_name
             FROM escalation_logs el
             JOIN tickets t ON el.ticket_id = t.id
             LEFT JOIN projects p ON t.project_id = p.id
             LEFT JOIN users fu ON el.from_user_id = fu.id
             LEFT JOIN users tu ON el.to_user_id = tu.id
             ORDER BY el.escalated_at DESC LIMIT 10`
        );

        const summary = {
            total: n(overall[0]?.total),
            open: n(overall[0]?.open_count),
            in_progress: n(overall[0]?.inprogress_count),
            resolved: n(overall[0]?.resolved_count),
            closed: n(overall[0]?.closed_count),
            escalated: n(overall[0]?.escalated_count),
            overdue: n(overall[0]?.overdue_count),
        };

        const charts = {
            priority: (priority || []).map(p => ({ priority: p.priority, count: p.count })),
            escalation: (escalations || []).map(e => ({ escalation_level: `L${e.escalation_level}`, count: e.count })),
            status: (statusBreakdown || []).map(s => ({ status: s.status, count: s.count })),
            source: (sourceBreakdown || []).map(s => ({ source: s.source || 'manual', count: s.count })),
        };

        const customers = (customerWise || []).map(c => ({
            id: c.id,
            name: c.customer_name,
            customer_code: c.customer_code || 'N/A',
            open_tickets: n(c.open_tickets),
            total_tickets: n(c.total_tickets),
        }));

        const recent_escalations = (recentEscalations || []).map(e => ({
            id: e.id,
            ticket_number: e.ticket_number,
            new_level: e.new_level,
            project_name: e.project_name || 'Support',
            from_name: e.from_name,
            to_name: e.to_name,
            created_at: e.escalated_at,
        }));

        return res.json({
            success: true,
            role_scope: ROLE_SCOPE[role] || "Your tickets",
            summary,
            charts,
            customers,
            recent_escalations,
        });
    } catch (err) {
        console.error("❌ getDashboard Error:", err);
        return res.status(500).json({ success: false, message: "Dashboard error: " + err.message });
    }
};
