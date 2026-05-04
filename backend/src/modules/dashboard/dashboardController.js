// modules/dashboard/dashboardController.js
import connectDB from "../../db/index.js";
import { buildRoleFilter } from "../../utils/roleFilter.js";

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
        const { role } = req.user;
        const { targetUserId, shiftId } = req.query;

        const { where: baseWhere, params: baseParams } = buildRoleFilter(req.user);
        let roleFilter = baseWhere;
        let rp = [...baseParams];

        if (role === 'superadmin' || role === 'manager' || role === 'gm') {
            if (targetUserId) {
                roleFilter = "t.assigned_to = ?";
                rp = [targetUserId];
            } else if (shiftId) {
                roleFilter = "t.assigned_to IN (SELECT user_id FROM shift_members WHERE shift_id = ?)";
                rp = [shiftId];
            }
            // else: keep baseWhere — scoped to their own hierarchy
        }

        const n = (val) => { const v = parseInt(val); return isNaN(v) ? 0 : v; };

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

        const [priority] = await pool.query(
            `SELECT priority, COUNT(*) as count FROM tickets t WHERE ${roleFilter} GROUP BY priority ORDER BY priority`, rp
        );

        const [escalations] = await pool.query(
            `SELECT escalation_level, COUNT(*) as count FROM tickets t WHERE ${roleFilter} GROUP BY escalation_level ORDER BY escalation_level`, rp
        );

        const [statusBreakdown] = await pool.query(
            `SELECT status, COUNT(*) as count FROM tickets t WHERE ${roleFilter} GROUP BY status`, rp
        );

        const [sourceBreakdown] = await pool.query(
            `SELECT COALESCE(source, 'manual') as source, COUNT(*) as count FROM tickets t WHERE ${roleFilter} GROUP BY source`, rp
        );

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

        const [recentEscalations] = await pool.query(
            `SELECT el.id, el.escalation_level as new_level, el.escalated_at,
                t.ticket_number, p.name as project_name,
                fu.name as from_name, tu.name as to_name
             FROM escalation_logs el
             JOIN tickets t ON el.ticket_id = t.id
             LEFT JOIN projects p ON t.project_id = p.id
             LEFT JOIN users fu ON el.from_user_id = fu.id
             LEFT JOIN users tu ON el.to_user_id = tu.id
             WHERE (${roleFilter})
             ORDER BY el.escalated_at DESC LIMIT 10`,
            rp
        );

        const [recentTickets] = await pool.query(
            `SELECT t.id, t.ticket_number, t.subject, t.status, t.priority, t.etr, t.created_at,
                t.source, t.category, t.escalation_level as level,
                u.name as assigned_to_name,
                c.name as customer_name
             FROM tickets t 
             LEFT JOIN users u ON t.assigned_to = u.id
             LEFT JOIN customers c ON t.customer_id = c.id
             WHERE ${roleFilter} AND t.status NOT IN ('resolved', 'closed')
             ORDER BY t.created_at DESC LIMIT 100`,
            rp
        );

        // --- NEW: Unified Monitoring Data (Transplanted from monitoringController) ---
        let monitoring = null;
        if (role === 'superadmin' || role === 'manager' || role === 'gm') {
            // 1. Response Trends (Last 24 hours)
            const [trends] = await pool.query(
                `SELECT HOUR(created_at) as hour, COUNT(*) as count 
                 FROM tickets 
                 WHERE created_at > (NOW() - INTERVAL 24 HOUR)
                 GROUP BY HOUR(created_at)
                 ORDER BY hour ASC`
            );

            // 2. Shift-wise Manpower & Health (Decision Engine)
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
                let health = 'healthy', reason = 'Normal Operations';
                if (s.breached_tickets > 0) { health = 'critical'; reason = `${s.breached_tickets} SLA Breaches`; }
                else if (staffingGap > 2) { health = 'critical'; reason = `Severely Understaffed (-${staffingGap})`; }
                else if (staffingGap > 0) { health = 'warning'; reason = `Capacity Warning (-${staffingGap})`; }
                return { ...s, manpower_needed: needed, health, health_reason: reason };
            });

            monitoring = { trends, shiftMetrics };
        }
        // ------------------------------------------------------------------------------

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
            recent_tickets: recentTickets,
            monitoring // Unified operational data
        });
    } catch (err) {
        console.error("❌ getDashboard Error:", err);
        return res.status(500).json({ success: false, message: "Dashboard error: " + err.message });
    }
};
