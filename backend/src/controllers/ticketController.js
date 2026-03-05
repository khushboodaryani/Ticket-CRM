// src/controllers/ticketController.js
import connectDB from "../db/index.js";
import moment from "moment-timezone";
import { sendTicketNotification } from "../services/emailService.js";
import { logger } from "../logger.js";

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

// ─────────────────────────────────────────────────────────
// BULK TOOLS
// ─────────────────────────────────────────────────────────

/**
 * POST /api/tickets/import
 * Body: { rows: [{ customer, project, category, priority, description, source, assigned_to, notes }] }
 * Superadmin / GM / Manager only.
 */
export const importTickets = async (req, res) => {
    try {
        const pool = connectDB();
        const { rows } = req.body;
        if (!Array.isArray(rows) || rows.length === 0)
            return res.status(400).json({ success: false, message: "No rows provided." });

        // Priority normaliser
        const normPriority = (v = "") => {
            const u = String(v).trim().toUpperCase();
            if (["P1", "P2", "P3", "P4", "P5"].includes(u)) return u;
            if (u === "CRITICAL") return "P1";
            if (u === "HIGH") return "P2";
            if (["MEDIUM", "NORMAL"].includes(u)) return "P3";
            if (u === "LOW") return "P4";
            if (["MINIMAL", "VERY LOW"].includes(u)) return "P5";
            return "P3"; // default
        };

        // Pre-load customers, users, and today's ticket count for fast lookup/numbering
        const [allCustomers] = await pool.query("SELECT id, name, customer_code FROM customers");
        const [allUsers] = await pool.query("SELECT id, name, email FROM users WHERE role='agent'");
        const [countRow] = await pool.query(`SELECT COUNT(*) as cnt FROM tickets WHERE DATE(created_at)=CURDATE()`);
        let nextSeq = (countRow[0]?.cnt || 0) + 1;

        const findCustomer = (v) => {
            if (!v) return null;
            const s = v.toLowerCase().trim();
            return allCustomers.find(c => c.name.toLowerCase() === s || (c.customer_code || "").toLowerCase() === s) || null;
        };
        const findUser = (v) => {
            if (!v) return null;
            const s = v.toLowerCase().trim();
            return allUsers.find(u => u.name.toLowerCase() === s || u.email.toLowerCase() === s) || null;
        };

        const created = [], failed = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 1;

            try {
                const customer = findCustomer(row.customer);
                if (!customer) { failed.push({ row: rowNum, reason: `Customer not found: "${row.customer}"` }); continue; }

                // Load project for that customer
                const [projects] = await pool.query(
                    "SELECT id, name FROM projects WHERE customer_id=?", [customer.id]
                );
                const project = projects.find(p => p.name.toLowerCase() === (row.project || "").toLowerCase().trim());
                if (!project) { failed.push({ row: rowNum, reason: `Project not found: "${row.project}" under ${customer.name}` }); continue; }

                if (!row.category?.trim()) { failed.push({ row: rowNum, reason: "category is required" }); continue; }
                if (!row.description?.trim()) { failed.push({ row: rowNum, reason: "description is required" }); continue; }

                const priority = normPriority(row.priority);
                // Source ENUM: ('email','call','manual','csv')
                const source = "csv"; // Always set to csv for bulk imports

                const assigned_to = findUser(row.assigned_to)?.id || req.user.userId;
                const etr = buildETR();

                // ── Duplicate Detection ──────────────────────────────────
                // Check if a ticket with same description for same customer/project exists (last 24h)
                const [dupes] = await pool.query(
                    `SELECT id FROM tickets 
                     WHERE customer_id=? AND project_id=? AND description=? 
                     AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) 
                     LIMIT 1`,
                    [customer.id, project.id, row.description.trim()]
                );
                if (dupes.length > 0) {
                    failed.push({ row: rowNum, reason: `Potential duplicate ticket found (ID: ${dupes[0].id})` });
                    continue;
                }

                // Generate ticket number: TKT-YYYYMMDD-XXXX
                const seqStr = String(nextSeq++).padStart(4, "0");
                const ticketNumber = `TKT-${moment().tz(TZ).format("YYYYMMDD")}-${seqStr}`;

                const [result] = await pool.query(`
                    INSERT INTO tickets
                      (ticket_number, customer_id, project_id, category, priority, description, source, assigned_to, etr, status, escalation_level, created_by)
                    VALUES (?,?,?,?,?,?,?,?,?, 'open', 1, ?)`,
                    [ticketNumber, customer.id, project.id, row.category.trim(), priority, row.description.trim(), source, assigned_to, etr, req.user.userId]
                );

                const ticketId = result.insertId;

                // Notes → first activity
                if (row.notes?.trim()) {
                    await pool.query(
                        "INSERT INTO ticket_activities (ticket_id, performed_by, action, note) VALUES (?,?,?,?)",
                        [ticketId, req.user.userId, "note_added", row.notes.trim()]
                    );
                }

                // ── Dynamic Notifications ────────────────────────────────
                // Sanitize email/phone (remove brackets, etc.)
                const cleanEmail = row.email?.replace(/[\[\]]/g, "").trim();
                const cleanPhone = row.phone?.replace(/[\[\]]/g, "").trim();

                // If CSV row has email, notify via email
                if (cleanEmail) {
                    // We need to pass a mock/temp ticket object to the service
                    const tempTicket = { ticket_number: ticketNumber, category: row.category, priority, description: row.description, etr };
                    sendTicketNotification(tempTicket, cleanEmail).catch(e => logger.error(`Import Email Notify Fail: ${e.message}`));
                }

                // If CSV row has phone, trigger SMS (Simulated)
                if (cleanPhone) {
                    logger.info(`📱 SMS NOTIFICATION SIMULATED for ${cleanPhone}: Ticket ${ticketNumber} created.`);
                    // In a real scenario, you'd call an SMS gateway service here
                }

                created.push({ row: rowNum, ticket_number: ticketNumber, customer: customer.name });
            } catch (rowErr) {
                failed.push({ row: rowNum, reason: rowErr.message });
            }
        }

        return res.json({
            success: true,
            summary: { total: rows.length, created: created.length, failed: failed.length },
            created,
            failed,
        });
    } catch (err) {
        console.error("importTickets:", err);
        return res.status(500).json({ success: false, message: "Import error: " + err.message });
    }
};

/**
 * GET /api/tickets/export
 * Streams a role-scoped CSV file.
 */
export const exportTickets = async (req, res) => {
    try {
        const pool = connectDB();
        const { where: roleWhere, params: roleParams } = buildRoleFilter(req.user);
        const { status, priority, customer_id } = req.query;

        let filters = [`(${roleWhere})`];
        const params = [...roleParams];
        if (status) { filters.push("t.status=?"); params.push(status); }
        if (priority) { filters.push("t.priority=?"); params.push(priority); }
        if (customer_id) { filters.push("t.customer_id=?"); params.push(customer_id); }

        const [rows] = await pool.query(`
            SELECT t.ticket_number, t.status, t.priority, t.category, t.source,
                   t.escalation_level, t.description, t.etr, t.created_at, t.updated_at,
                   c.name as customer, p.name as project,
                   u.name as assigned_to
            FROM tickets t
            LEFT JOIN customers c  ON t.customer_id  = c.id
            LEFT JOIN projects  p  ON t.project_id   = p.id
            LEFT JOIN users     u  ON t.assigned_to  = u.id
            WHERE ${filters.join(" AND ")}
            ORDER BY t.created_at DESC`, params);

        const headers = ["ticket_number", "customer", "project", "category", "priority", "status", "source", "escalation_level", "assigned_to", "description", "etr", "created_at"];
        const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

        let csv = headers.join(",") + "\n";
        for (const r of rows) {
            csv += headers.map(h => escape(r[h])).join(",") + "\n";
        }

        const filename = `tickets_export_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(csv);
    } catch (err) {
        console.error("exportTickets:", err);
        return res.status(500).json({ success: false, message: "Export error: " + err.message });
    }
};

/**
 * PUT /api/tickets/bulk
 * Body: { ids: [1,2,3], status?, assigned_to? }
 */
export const bulkUpdateTickets = async (req, res) => {
    try {
        const pool = connectDB();
        const { ids, status, assigned_to } = req.body;
        if (!Array.isArray(ids) || ids.length === 0)
            return res.status(400).json({ success: false, message: "No ticket IDs provided." });

        const updates = [], vals = [];
        const VALID_STATUSES = ["open", "in_progress", "pending", "resolved", "closed"];
        if (status && VALID_STATUSES.includes(status)) { updates.push("status=?"); vals.push(status); }
        if (assigned_to) { updates.push("assigned_to=?"); vals.push(assigned_to); }
        if (!updates.length)
            return res.status(400).json({ success: false, message: "Nothing to update." });

        updates.push("updated_at=NOW()");
        const placeholders = ids.map(() => "?").join(",");
        vals.push(...ids);
        await pool.query(`UPDATE tickets SET ${updates.join(",")} WHERE id IN (${placeholders})`, vals);

        return res.json({ success: true, message: `${ids.length} ticket(s) updated.`, updated: ids.length });
    } catch (err) {
        console.error("bulkUpdateTickets:", err);
        return res.status(500).json({ success: false, message: "Bulk update error: " + err.message });
    }
};
