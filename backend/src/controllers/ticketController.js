// src/controllers/ticketController.js
import connectDB from "../db/index.js";
import moment from "moment-timezone";

const TZ = process.env.TIMEZONE || "Asia/Kolkata";

/**
 * Build ETR: current time + 2 hours (shift-aware ETR is adjusted by SLA engine)
 */
const buildETR = () => moment().tz(TZ).add(2, "hours").format("YYYY-MM-DD HH:mm:ss");

// Role-based WHERE clauses
const buildRoleFilter = (user) => {
    const { userId, role } = user;
    switch (role) {
        case "agent": return { where: "t.assigned_to = ?", params: [userId] };
        case "tl": return { where: "t.escalation_level >= 1 AND (t.assigned_to = ? OR t.assigned_to IN (SELECT id FROM users WHERE reporting_to = ?))", params: [userId, userId] };
        case "manager": return { where: "t.escalation_level >= 2 AND (t.assigned_to = ? OR t.assigned_to IN (SELECT id FROM users WHERE reporting_to = ? OR reporting_to IN (SELECT id FROM users WHERE reporting_to = ?)))", params: [userId, userId, userId] };
        case "gm": return { where: "t.escalation_level >= 3", params: [] };
        case "superadmin": return { where: "1=1", params: [] };
        default: return { where: "t.assigned_to = ?", params: [userId] };
    }
};

// GET /api/tickets
export const getTickets = async (req, res) => {
    try {
        const pool = connectDB();
        const { status, priority, escalation_level, customer_id, project_id, page = 1, limit = 20 } = req.query;
        const { where: roleWhere, params: roleParams } = buildRoleFilter(req.user);

        let filters = [`(${roleWhere})`];
        const params = [...roleParams];

        if (status) { filters.push("t.status=?"); params.push(status); }
        if (priority) { filters.push("t.priority=?"); params.push(priority); }
        if (escalation_level) { filters.push("t.escalation_level=?"); params.push(Number(escalation_level)); }
        if (customer_id) { filters.push("t.customer_id=?"); params.push(customer_id); }
        if (project_id) { filters.push("t.project_id=?"); params.push(project_id); }

        const whereClause = filters.join(" AND ");
        const offset = (Number(page) - 1) * Number(limit);

        const [rows] = await pool.query(
            `SELECT t.*,
              c.name as customer_name, p.name as project_name,
              u.name as assigned_to_name, cb.name as created_by_name
       FROM tickets t
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN users cb ON t.created_by = cb.id
       WHERE ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
            [...params, Number(limit), offset]
        );

        const [countRes] = await pool.query(
            `SELECT COUNT(*) as total FROM tickets t WHERE ${whereClause}`,
            params
        );

        return res.json({
            success: true,
            tickets: rows,
            pagination: { total: countRes[0].total, page: Number(page), limit: Number(limit) },
        });
    } catch (err) {
        console.error("getTickets:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/tickets/:id
export const getTicketById = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT t.*,
              c.name as customer_name, p.name as project_name,
              u.name as assigned_to_name, cb.name as created_by_name
       FROM tickets t
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN users cb ON t.created_by = cb.id
       WHERE t.id = ?`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: "Ticket not found." });

        // Fetch escalation logs
        const [logs] = await pool.query(
            `SELECT el.*, fu.name as from_name, tu.name as to_name
       FROM escalation_logs el
       LEFT JOIN users fu ON el.from_user_id = fu.id
       LEFT JOIN users tu ON el.to_user_id = tu.id
       WHERE el.ticket_id = ? ORDER BY el.escalated_at ASC`,
            [req.params.id]
        );

        // Fetch activity
        const [activity] = await pool.query(
            `SELECT ta.*, u.name as performed_by_name FROM ticket_activities ta
       LEFT JOIN users u ON ta.performed_by = u.id
       WHERE ta.ticket_id = ? ORDER BY ta.created_at ASC`,
            [req.params.id]
        );

        return res.json({ success: true, ticket: rows[0], escalation_logs: logs, activity });
    } catch (err) {
        console.error("getTicketById:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/tickets
export const createTicket = async (req, res) => {
    const { customer_id, project_id, category, priority, description, source, assigned_to } = req.body;
    if (!customer_id || !project_id || !category || !priority || !description)
        return res.status(400).json({ success: false, message: "customer_id, project_id, category, priority, description are required." });

    const validPriorities = ["P1", "P2", "P3", "P4", "P5"];
    if (!validPriorities.includes(priority))
        return res.status(400).json({ success: false, message: "Priority must be P1–P5." });

    try {
        const pool = connectDB();
        const now = moment().tz(TZ).format("YYYY-MM-DD HH:mm:ss");
        const etr = buildETR();
        const attachment_url = req.file ? `/attachments/${req.file.filename}` : null;

        // Generate ticket number: TKT-YYYYMMDD-XXXX
        const [countRow] = await pool.query(`SELECT COUNT(*) as cnt FROM tickets WHERE DATE(created_at)=CURDATE()`);
        const seq = String(countRow[0].cnt + 1).padStart(4, "0");
        const ticket_number = `TKT-${moment().tz(TZ).format("YYYYMMDD")}-${seq}`;

        // Find default agent to assign (if not provided, assign to caller if agent)
        let finalAssignee = assigned_to || null;
        if (!finalAssignee && req.user.role === "agent") finalAssignee = req.user.userId;

        const [result] = await pool.query(
            `INSERT INTO tickets (ticket_number, customer_id, project_id, category, priority, description,
       attachment_url, status, escalation_level, str, etr, created_by, assigned_to, source)
       VALUES (?,?,?,?,?,?,?,'open',1,?,?,?,?,?)`,
            [ticket_number, customer_id, project_id, category, priority, description,
                attachment_url, now, etr, req.user.userId, finalAssignee, source || "manual"]
        );

        // Fetch customer email for notification
        const [custRows] = await pool.query(`SELECT email FROM customers WHERE id = ?`, [customer_id]);
        const customerEmail = custRows[0]?.email;

        // Log activity
        await pool.query(
            `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,'created',?,?)`,
            [result.insertId, req.user.userId, `Ticket created via ${source || "manual"}`]
        );

        // Send Notification Email (async)
        if (customerEmail) {
            import("../services/emailService.js").then(module => {
                module.sendTicketNotification({
                    ticket_number,
                    category,
                    priority,
                    description,
                    etr
                }, customerEmail);
            });
        }

        return res.status(201).json({ success: true, message: "Ticket created.", ticketId: result.insertId, ticket_number });
    } catch (err) {
        console.error("createTicket:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PUT /api/tickets/:id
export const updateTicket = async (req, res) => {
    const { category, priority, description, status, assigned_to } = req.body;
    try {
        const pool = connectDB();
        const [existing] = await pool.query(`SELECT * FROM tickets WHERE id=?`, [req.params.id]);
        if (!existing.length) return res.status(404).json({ success: false, message: "Ticket not found." });

        const updates = [];
        const vals = [];
        if (category) { updates.push("category=?"); vals.push(category); }
        if (priority) { updates.push("priority=?"); vals.push(priority); }
        if (description) { updates.push("description=?"); vals.push(description); }
        if (status) { updates.push("status=?"); vals.push(status); }
        if (assigned_to) { updates.push("assigned_to=?"); vals.push(assigned_to); }
        if (req.file) { updates.push("attachment_url=?"); vals.push(`/attachments/${req.file.filename}`); }

        // Auto-close resolved tickets
        if (status === "resolved") {
            updates.push("resolved_at=NOW()");
        }

        if (!updates.length) return res.status(400).json({ success: false, message: "Nothing to update." });

        vals.push(req.params.id);
        await pool.query(`UPDATE tickets SET ${updates.join(",")} WHERE id=?`, vals);

        // Log activity
        await pool.query(
            `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,'updated',?,?)`,
            [req.params.id, req.user.userId, `Status changed to ${status || existing[0].status}`]
        );

        return res.json({ success: true, message: "Ticket updated." });
    } catch (err) {
        console.error("updateTicket:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/tickets/:id/escalate  (manual override)
export const escalateTicket = async (req, res) => {
    const { reason } = req.body;
    try {
        const pool = connectDB();
        const [rows] = await pool.query(`SELECT * FROM tickets WHERE id=?`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: "Ticket not found." });

        const ticket = rows[0];
        const newLevel = Math.min(ticket.escalation_level + 1, 4);

        // Find next assignee based on level
        let newAssignee = ticket.assigned_to;
        const [nextUser] = await pool.query(
            `SELECT id FROM users WHERE reporting_to = ? AND is_active=1 LIMIT 1`,
            [ticket.assigned_to]
        );
        if (nextUser.length) newAssignee = nextUser[0].id;

        await pool.query(
            `UPDATE tickets SET escalation_level=?, assigned_to=? WHERE id=?`,
            [newLevel, newAssignee, req.params.id]
        );

        await pool.query(
            `INSERT INTO escalation_logs (ticket_id, from_user_id, to_user_id, escalation_level, reason, escalated_at)
       VALUES (?,?,?,?,?,NOW())`,
            [req.params.id, ticket.assigned_to, newAssignee, newLevel, reason || "Manual escalation"]
        );

        await pool.query(
            `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,'escalated',?,?)`,
            [req.params.id, req.user.userId, `Manually escalated to Level ${newLevel}`]
        );

        return res.json({ success: true, message: `Ticket escalated to Level ${newLevel}.`, escalation_level: newLevel });
    } catch (err) {
        console.error("escalateTicket:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/tickets/queue/str  – STR queue view
export const getSTRQueue = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT t.id, t.ticket_number, t.priority, t.status, t.escalation_level, t.str, t.etr,
              u.name as assigned_to_name, u.role as assigned_role,
              c.name as customer_name, p.name as project_name
       FROM tickets t
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.status IN ('open','in_progress')
       ORDER BY t.priority ASC, t.str ASC`
        );
        return res.json({ success: true, queue: rows });
    } catch (err) {
        console.error("getSTRQueue:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
