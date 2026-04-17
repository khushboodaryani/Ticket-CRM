// modules/tickets/ticketController.js
import connectDB from "../../db/index.js";
import moment from "moment-timezone";
import { sendTicketNotification, sendTicketStatusNotification } from "../notifications/emailService.js";
import { createNotification } from "../notifications/notificationController.js";
import { workflowEvents } from "../workflows/workflowEngine.js";
import { logger } from "../../logger.js";
import { getShiftAssignee } from "../../services/assignmentService.js";
import { config } from "dotenv";
config();

const TZ = process.env.TIMEZONE || "Asia/Kolkata";
const buildETR = () => moment().tz(TZ).add(2, "hours").format("YYYY-MM-DD HH:mm:ss");

const buildRoleFilter = (user) => {
    const { userId, role } = user;
    switch (role) {
        case "agent": return { where: "(t.assigned_to = ? OR t.assigned_to IS NULL)", params: [userId] };
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
        const { status, priority, escalation_level, customer_id, project_id, queue_id, assigned_to, startDate, endDate, page = 1, limit = 20 } = req.query;
        const { where: roleWhere, params: roleParams } = buildRoleFilter(req.user);

        let filters = [`(${roleWhere})`];
        const params = [...roleParams];

        if (status) { filters.push("t.status=?"); params.push(status); }
        if (priority) { filters.push("t.priority_id=?"); params.push(priority); }
        if (escalation_level) { filters.push("t.escalation_level=?"); params.push(Number(escalation_level)); }
        if (customer_id) { filters.push("t.customer_id=?"); params.push(customer_id); }
        if (project_id) { filters.push("t.project_id=?"); params.push(project_id); }
        if (queue_id) { filters.push("t.queue_id=?"); params.push(queue_id); }
        if (assigned_to) { filters.push("t.assigned_to=?"); params.push(assigned_to); }
        if (startDate) { filters.push("DATE(t.created_at) >= ?"); params.push(startDate); }
        if (endDate) { filters.push("DATE(t.created_at) <= ?"); params.push(endDate); }

        const whereClause = filters.join(" AND ");
        const offset = (Number(page) - 1) * Number(limit);

        const [rows] = await pool.query(
            `SELECT t.*,
              c.name as customer_name, p.name as project_name,
              u.name as assigned_to_name, cb.name as created_by_name,
              q.name as queue_name,
              COALESCE(pri.name, t.priority) as priority, COALESCE(cat.prefix, 'TKT') as series_prefix, pri.color_code
       FROM tickets t
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN users cb ON t.created_by = cb.id
       LEFT JOIN queues q ON t.queue_id = q.id
       LEFT JOIN priorities pri ON t.priority_id = pri.id
       LEFT JOIN sla_priority_categories cat ON pri.category_id = cat.id
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
              u.name as assigned_to_name, cb.name as created_by_name,
              q.name as queue_name,
              COALESCE(pri.name, t.priority) as priority, COALESCE(cat.prefix, 'TKT') as series_prefix, pri.color_code
       FROM tickets t
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN users cb ON t.created_by = cb.id
       LEFT JOIN queues q ON t.queue_id = q.id
       LEFT JOIN priorities pri ON t.priority_id = pri.id
       LEFT JOIN sla_priority_categories cat ON pri.category_id = cat.id
       WHERE t.id = ?`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: "Ticket not found." });

        // -- IDEA 3: 1st Responder Auto-Assign (Atomic Claim for P-Series) --
        if (rows[0].series_prefix === 'P' && !rows[0].assigned_to && req.user && rows[0].created_by !== req.user.userId) {
            const lockName = `p1_claim_${req.params.id}`;
            const [lockRes] = await pool.query(`SELECT GET_LOCK(?, 5) as locked`, [lockName]);
            
            try {
                if (lockRes[0]?.locked) {
                    // Re-check unassigned state under lock
                    const [recheck] = await pool.query(`SELECT assigned_to, ticket_number FROM tickets WHERE id = ?`, [req.params.id]);
                    
                    if (recheck.length && !recheck[0].assigned_to) {
                        logger.info(`🚨 P1 Claim SECURED by ${req.user.name} for TKT: ${recheck[0].ticket_number}`);
                        
                        const [updateResult] = await pool.query(
                            `UPDATE tickets SET assigned_to = ? WHERE id = ? AND assigned_to IS NULL`, 
                            [req.user.userId, req.params.id]
                        );
                        
                        if (updateResult.affectedRows > 0) {
                            // Side-effects are now protected by the lock
                            await pool.query(
                                `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,'updated',?,?)`,
                                [req.params.id, req.user.userId, `Emergency ticket auto-claimed by viewing`]
                            );

                            try {
                                const socketModule = await import("../../services/socketService.js");
                                socketModule.broadcast("emergency_claimed", { 
                                    ticket_id: req.params.id, 
                                    assigned_to_name: req.user.name 
                                });
                            } catch (e) { logger.error("Claim socket broadcast failed: " + e.message); }

                            try {
                                const m = await import("../notifications/emailService.js");
                                await m.sendEmergencyClaimedBroadcast(rows[0], req.user.name);
                            } catch (e) { logger.error("Claim email broadcast failed: " + e.message); }

                            rows[0].assigned_to = req.user.userId;
                            rows[0].assigned_to_name = req.user.name;
                        }
                    }
                }
            } finally {
                await pool.query(`SELECT RELEASE_LOCK(?)`, [lockName]);
            }
        }

        const [logs] = await pool.query(
            `SELECT el.*, fu.name as from_name, tu.name as to_name
       FROM escalation_logs el
       LEFT JOIN users fu ON el.from_user_id = fu.id
       LEFT JOIN users tu ON el.to_user_id = tu.id
       WHERE el.ticket_id = ? ORDER BY el.escalated_at ASC`,
            [req.params.id]
        );

        const [activity] = await pool.query(
            `SELECT ta.*, u.name as performed_by_name FROM ticket_activities ta
       LEFT JOIN users u ON ta.performed_by = u.id
       WHERE ta.ticket_id = ? ORDER BY ta.created_at ASC`,
            [req.params.id]
        );

        const [tasks] = await pool.query(
            `SELECT tt.*, u.name as assigned_to_name, cb.name as created_by_name
             FROM ticket_tasks tt
             LEFT JOIN users u ON tt.assigned_to = u.id
             LEFT JOIN users cb ON tt.created_by = cb.id
             WHERE tt.ticket_id=? ORDER BY tt.created_at ASC`,
            [req.params.id]
        );

        return res.json({ success: true, ticket: rows[0], escalation_logs: logs, activity, tasks });
    } catch (err) {
        console.error("getTicketById:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/tickets
export const createTicket = async (req, res) => {
    const { customer_id, project_id, category, priority, description, source, assigned_to, queue_id } = req.body;
    if (!customer_id || !project_id || !category || !priority || !description)
        return res.status(400).json({ success: false, message: "customer_id, project_id, category, priority, description are required." });

    try {
        const pool = connectDB();
        
        // Ensure customer and project exist and are not deleted
        const [targetCheck] = await pool.query(
            `SELECT c.id FROM customers c 
             JOIN projects p ON p.customer_id = c.id
             WHERE c.id = ? AND p.id = ? AND c.is_deleted = 0 AND p.is_deleted = 0`,
            [customer_id, project_id]
        );
        if (!targetCheck.length) {
            return res.status(400).json({ success: false, message: "Selected Customer or Project is archived or invalid." });
        }

        // 1. Resolve Priority Entity
        const [prioRows] = await pool.query(
            `SELECT p.id, c.prefix 
             FROM priorities p 
             JOIN sla_priority_categories c ON p.category_id = c.id 
             WHERE p.name = ?`, 
            [priority]
        );
        if (!prioRows.length) return res.status(400).json({ success: false, message: "Invalid priority name." });
        const priorityId = prioRows[0].id;
        const series_prefix = prioRows[0].prefix;

        const now = moment().tz(TZ).format("YYYY-MM-DD HH:mm:ss");

        // 2. Resolve Frozen Timezone (Customer -> Project -> Global)
        const { resolveTicketTimezone, resolveSlaPolicy, generateTicketNumber, getSlaCalendar } = await import("../sla/slaPolicyService.js");
        const resolvedTz = await resolveTicketTimezone(pool, { customerId: customer_id, projectId: project_id });

        // 3. Resolve SLA Policy
        const slaPolicy = await resolveSlaPolicy(pool, { customerId: customer_id, projectId: project_id, priorityId });
        
        // 4. Calculate ETR (Enterprise Calculator - Offline Aware)
        const { SlaCalculator } = await import("../../services/sla/calculator.js");
        const calendar = await getSlaCalendar(pool);
        const calculator = new SlaCalculator(pool);
        const etrMoment = calculator.computeDueDate(now, slaPolicy.resolution_hrs, calendar);
        const etr = etrMoment.format("YYYY-MM-DD HH:mm:ss");

        // 5. Generate Ticket Number (P-00001)
        const ticket_number = await generateTicketNumber(pool, priorityId);

        const attachment_url = req.file ? `/attachments/${req.file.filename}` : null;
        const initialAssignee = assigned_to || null;
        const assignmentSource = initialAssignee ? 'manual' : 'auto';

        const [result] = await pool.query(
            `INSERT INTO tickets (
                ticket_number, customer_id, project_id, category, priority_id, description,
                attachment_url, status, escalation_level, sla_state, str, etr, 
                created_by, assigned_to, source, queue_id, assignment_source,
                resolved_timezone, sla_policy_id, sla_version
            )
            VALUES (?,?,?,?,?,?,?, 'open', 1, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                ticket_number, customer_id, project_id, category, priorityId, description,
                attachment_url, now, etr, req.user.userId, initialAssignee, 
                source || "manual", queue_id || null, assignmentSource,
                resolvedTz, slaPolicy.id, slaPolicy.version
            ]
        );

        const ticketId = result.insertId;

        // 6. Schedule BullMQ Jobs
        const { jobManager } = await import("../../services/sla/jobManager.js");
        await jobManager.scheduleJobs({ id: ticketId, etr, resolved_timezone: resolvedTz }, calendar);

        // Log creation activity
        await pool.query(
            `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,'created',?,?)`,
            [ticketId, req.user.userId, `Ticket created via ${source || "manual"}`]
        );

        // Auto-create conversation envelope
        const [ticketRows] = await pool.query(
            `SELECT c.email as customer_email FROM tickets t LEFT JOIN customers c ON t.customer_id=c.id WHERE t.id=?`,
            [ticketId]
        );
        const customerEmail = ticketRows[0]?.customer_email;

        await pool.query(
            `INSERT INTO conversations (ticket_id, source_channel, participant_identity) VALUES (?,?,?)`,
            [ticketId, source || 'manual', customerEmail || null]
        );

        // Notify assigned agent
        if (initialAssignee) {
            await createNotification(pool, {
                user_id: initialAssignee,
                type: 'ticket_assigned',
                title: `New Ticket Assigned: ${ticket_number}`,
                body: `Ticket ${ticket_number} (${priority} - ${category}) has been assigned to you.`,
                entity_id: ticketId
            });
        }

        // Event-driven acknowledgement is handled by workflowEngine -> ticket_created

        // Emit workflow event
        workflowEvents.emit('ticket_created', {
            ticketId,
            payload: { customer_id, project_id, category, priority, status: 'open', source: source || 'manual', queue_id }
        });

        // Trigger Global Broadcast for P1 — MUST complete BEFORE response is sent
        // Otherwise the frontend navigates away and misses the socket event
        if (priority === 'P1') {
            logger.info(`🚨 P1 EMERGENCY DETECTED in CreateTicket! Triggering broadcast for ${ticket_number}`);
            try {
                const { sendEmergencyBroadcast } = await import("../notifications/emailService.js");
                await sendEmergencyBroadcast({
                    id: ticketId,
                    ticket_number: ticket_number,
                    category: category,
                    priority: priority,
                    description: description,
                    etr: etr
                });
                logger.info(`✅ P1 Emergency Broadcast completed for ${ticket_number}`);
            } catch (e) {
                logger.error(`P1 Broadcast Error: ${e.message}`);
            }
        }

        return res.status(201).json({ success: true, message: "Ticket created.", ticketId, ticket_number });
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
        const [existing] = await pool.query(
            `SELECT t.*, c.email as customer_email FROM tickets t 
             LEFT JOIN customers c ON t.customer_id = c.id 
             WHERE t.id=?`, 
            [req.params.id]
        );
        if (!existing.length) return res.status(404).json({ success: false, message: "Ticket not found." });

        const updates = [];
        const vals = [];
        let priorityId = null;

        if (category) { updates.push("category=?"); vals.push(category); }
        if (priority) { 
            const [prioRow] = await pool.query(`SELECT id FROM priorities WHERE name = ?`, [priority]);
            if (prioRow.length) {
                priorityId = prioRow[0].id;
                updates.push("priority_id=?");
                vals.push(priorityId);
            }
        }
        if (description) { updates.push("description=?"); vals.push(description); }
        if (status) { updates.push("status=?"); vals.push(status); }
        if (assigned_to) { updates.push("assigned_to=?"); vals.push(assigned_to); }
        if (req.file) { updates.push("attachment_url=?"); vals.push(`/attachments/${req.file.filename}`); }

        const oldStatus = existing[0].status;
        const newStatus = status;
        const now = moment().tz(existing[0].resolved_timezone || TZ);

        // --- ENTERPRISE SLA 2.1: Pause/Resume Logic ---
        const { jobManager } = await import("../../services/sla/jobManager.js");
        const { SlaCalculator } = await import("../../services/sla/calculator.js");
        const { getSlaCalendar } = await import("../sla/slaPolicyService.js");

        const pauseStatuses = ['pending', 'on_hold', 'waiting_customer'];
        const isCurrentlyPaused = existing[0].sla_paused === 1;
        const willBePaused = pauseStatuses.includes(newStatus);
        
        let newEtr = existing[0].etr;

        if (willBePaused && !isCurrentlyPaused && newStatus !== oldStatus) {
            // ENTERING PAUSE
            updates.push("sla_paused = 1", "sla_paused_at = NOW()");
            await jobManager.cancelJobs(req.params.id);
            
            await pool.query(
                `INSERT INTO sla_event_logs (ticket_id, event_type, old_etr, note) 
                 VALUES (?, 'pause', ?, ?)`,
                [req.params.id, existing[0].etr, `SLA paused at status ${newStatus}`]
            );
        } 
        else if (!willBePaused && isCurrentlyPaused && newStatus !== oldStatus) {
            // RESUMING
            const pausedAt = moment(existing[0].sla_paused_at).tz(existing[0].resolved_timezone || TZ);
            const pauseDuration = now.diff(pausedAt, 'minutes');
            const totalCumulative = (existing[0].cumulative_pause_minutes || 0) + pauseDuration;
            
            // Calculate remaining business time from original ETR
            const etrAtPause = moment(existing[0].etr).tz(existing[0].resolved_timezone || TZ);
            // Since original ETR was already business-aware, we need to find how much WORK was left.
            // Simplified Zoho approach: Find minutes between pauseTime and etr (using business hours logic)
            // But if we just treat existing[0].etr as a wall-clock target that was fixed, this is hard.
            // Better: We should have snapshotted 'remaining_minutes' at pause.
            // As a fallback for this first phase: We'll calculate it now.
            
            // For now, let's use the user's preferred approach: 
            // "Recalculate the absolute due date on resume as now + remaining_minutes"
            // We'll estimate remaining minutes as total goal - elapsed minutes (excluding previous pauses).
            
            const [policy] = await pool.query(`SELECT resolution_hrs FROM sla_policies_new WHERE id = ?`, [existing[0].sla_policy_id]);
            const goalHours = policy?.resolution_hrs || 8;
            
            // Total elapsed work minutes since creation - previous pauses
            const createdAt = moment(existing[0].created_at).tz(existing[0].resolved_timezone || TZ);
            // This is complex to do accurately without a "work elapsed" tracker.
            // For MVP: We add the pause duration directly to the ETR.
            
            const calendar = await getSlaCalendar(pool);
            const calculator = new SlaCalculator(pool);
            
            // Standard approach: Offset existing ETR by the time we were paused
            // This preserves the exact business window padding.
            const adjustedEtr = moment(existing[0].etr).add(pauseDuration, 'minutes').format("YYYY-MM-DD HH:mm:ss");
            newEtr = adjustedEtr;

            updates.push("sla_paused = 0", "sla_paused_at = NULL", "etr = ?", "cumulative_pause_minutes = ?");
            vals.push(adjustedEtr, totalCumulative);

            await pool.query(
                `INSERT INTO sla_event_logs (ticket_id, event_type, old_etr, new_etr, pause_duration_min, note) 
                 VALUES (?, 'resume', ?, ?, ?, ?)`,
                [req.params.id, existing[0].etr, adjustedEtr, pauseDuration, `SLA resumed. Total pause: ${totalCumulative}m`]
            );

            // Reschedule jobs
            await jobManager.scheduleJobs({ 
                id: req.params.id, 
                etr: adjustedEtr, 
                resolved_timezone: existing[0].resolved_timezone 
            }, calendar);
        }

        if (status === "resolved" || status === "closed") {
            updates.push("resolved_at=NOW()");
            updates.push("sla_state='completed'");
        }

        if (!updates.length) return res.status(400).json({ success: false, message: "Nothing to update." });

        vals.push(req.params.id);
        await pool.query(`UPDATE tickets SET ${updates.join(",")} WHERE id=?`, vals);

        await pool.query(
            `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,'updated',?,?)`,
            [req.params.id, req.user.userId, `Status changed to ${status || existing[0].status}`]
        );

        // Notify assigned agent if it changed
        if (assigned_to && assigned_to !== existing[0].assigned_to) {
            await createNotification(pool, {
                user_id: assigned_to,
                type: 'ticket_assigned',
                title: `Ticket Assigned to You: ${existing[0].ticket_number}`,
                body: `Ticket ${existing[0].ticket_number} has been assigned to you by ${req.user.name}.`,
                entity_id: req.params.id
            });
        }

        // Emit workflow event
        workflowEvents.emit('ticket_updated', {
            ticketId: req.params.id,
            payload: { category, priority, description, status, assigned_to }
        });

        if (status && status !== existing[0].status) {
            workflowEvents.emit('status_changed', {
                ticketId: req.params.id,
                payload: { old_status: existing[0].status, new_status: status }
            });

            // Event-driven status change is handled by workflowEngine -> status_changed
        }

        return res.json({ success: true, message: "Ticket updated." });
    } catch (err) {
        console.error("updateTicket:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PUT /api/tickets/:id/queue  — Assign ticket to a queue
export const assignQueue = async (req, res) => {
    const { queue_id } = req.body;
    try {
        const pool = connectDB();
        const [ticketRows] = await pool.query(
            `SELECT queue_id, priority, customer_id, project_id, etr FROM tickets WHERE id=?`, 
            [req.params.id]
        );
        if (!ticketRows.length) return res.status(404).json({ success: false, message: "Ticket not found." });

        const ticket = ticketRows[0];
        const oldQueueId = ticket.queue_id;
        const newQueueId = queue_id;

        // 1. Update ticket queue
        await pool.query(`UPDATE tickets SET queue_id=? WHERE id=?`, [newQueueId || null, req.params.id]);

        // 2. Audit Trail
        await pool.query(
            `INSERT INTO ticket_queue_logs (ticket_id, from_queue_id, to_queue_id, changed_by) VALUES (?, ?, ?, ?)`,
            [req.params.id, oldQueueId, newQueueId || null, req.user.userId]
        );
        // 3. SLA 2.1 Implementation: Update ETR based on current policy (no queue modifiers in v2.1)
        const { resolveSlaPolicy, getSlaCalendar } = await import("../sla/slaPolicyService.js");
        const { SlaCalculator } = await import("../../services/sla/calculator.js");
        
        const slaPolicy = await resolveSlaPolicy(pool, { 
            customerId: ticket.customer_id, 
            projectId: ticket.project_id, 
            priorityId: ticket.priority_id || (await pool.query(`SELECT id FROM priorities WHERE name = ?`, [ticket.priority]))[0][0]?.id
        });
        
        const calendar = await getSlaCalendar(pool);
        const calculator = new SlaCalculator(pool);
        const nowStr = moment().tz(TZ).format("YYYY-MM-DD HH:mm:ss");
        
        // Recalculate ETR from NOW based on full duration (Simplified migration path)
        const etrMoment = calculator.computeDueDate(nowStr, slaPolicy.resolution_hrs, calendar);
        const newEtr = etrMoment.format("YYYY-MM-DD HH:mm:ss");
        
        await pool.query("UPDATE tickets SET etr = ?, sla_policy_id = ?, sla_version = ? WHERE id = ?", 
            [newEtr, slaPolicy.id, slaPolicy.version, req.params.id]);

        await pool.query(
            `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,?,?,?)`,
            [req.params.id, 'queue_assigned', req.user.userId,
             newQueueId ? `Assigned to queue ID: ${newQueueId}. SLA policy synchronized.` : 'Removed from queue.']
        );

        return res.json({ success: true, message: "Queue assignment updated and SLA synchronized." });
    } catch (err) {
        console.error("assignQueue:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PUT /api/tickets/:id/priority  — Change priority with activity log
export const changePriority = async (req, res) => {
    const { priority, reason } = req.body;
    if (!priority)
        return res.status(400).json({ success: false, message: "Priority is required." });

    try {
        const pool = connectDB();
        const [rows] = await pool.query(`SELECT ticket_number, priority FROM tickets WHERE id=?`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: "Ticket not found." });

        // Dynamic priority validation from DB
        const validPriorities = await getConfiguredPriorities(pool);
        if (!validPriorities.includes(priority))
            return res.status(400).json({ success: false, message: `Invalid priority. Valid: ${validPriorities.join(', ')}` });

        const oldPriority = rows[0].priority;
        await pool.query(`UPDATE tickets SET priority=? WHERE id=?`, [priority, req.params.id]);

        await pool.query(
            `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,?,?,?)`,
            [req.params.id, 'priority_changed', req.user.userId,
             `Priority changed from ${oldPriority} to ${priority}${reason ? ': ' + reason : ''}`]
        );

        return res.json({ success: true, message: `Priority updated to ${priority}.` });
    } catch (err) {
        console.error("changePriority:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/tickets/:id/tasks  — Create sub-task
export const addTask = async (req, res) => {
    const { title, assigned_to, due_date } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, message: "Task title is required." });
    try {
        const pool = connectDB();
        const [ticketRows] = await pool.query(`SELECT id, ticket_number FROM tickets WHERE id=?`, [req.params.id]);
        if (!ticketRows.length) return res.status(404).json({ success: false, message: "Ticket not found." });

        const [result] = await pool.query(
            `INSERT INTO ticket_tasks (ticket_id, title, assigned_to, due_date, created_by) VALUES (?,?,?,?,?)`,
            [req.params.id, title.trim(), assigned_to || null, due_date || null, req.user.userId]
        );

        await pool.query(
            `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,?,?,?)`,
            [req.params.id, 'task_added', req.user.userId, `Task created: "${title.trim()}"`]
        );

        if (assigned_to) {
            await createNotification(pool, {
                user_id: assigned_to,
                type: 'ticket_updated',
                title: `New Task on Ticket: ${ticketRows[0].ticket_number}`,
                body: `You have been assigned a new task: "${title.trim()}"`,
                entity_id: req.params.id
            });
        }

        return res.status(201).json({ success: true, message: "Task added.", taskId: result.insertId });
    } catch (err) {
        console.error("addTask:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/tickets/:id/tasks
export const getTasks = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT tt.*, u.name as assigned_to_name, cb.name as created_by_name
             FROM ticket_tasks tt
             LEFT JOIN users u ON tt.assigned_to = u.id
             LEFT JOIN users cb ON tt.created_by = cb.id
             WHERE tt.ticket_id=? ORDER BY tt.created_at ASC`,
            [req.params.id]
        );
        return res.json({ success: true, tasks: rows });
    } catch (err) {
        console.error("getTasks:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PUT /api/tickets/:id/tasks/:taskId  — Toggle done or update task
export const updateTask = async (req, res) => {
    const { is_done, title, assigned_to, due_date } = req.body;
    try {
        const pool = connectDB();
        const [rows] = await pool.query(`SELECT * FROM ticket_tasks WHERE id=? AND ticket_id=?`, [req.params.taskId, req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: "Task not found." });

        const updates = [], vals = [];
        if (title !== undefined) { updates.push("title=?"); vals.push(title); }
        if (assigned_to !== undefined) { updates.push("assigned_to=?"); vals.push(assigned_to || null); }
        if (due_date !== undefined) { updates.push("due_date=?"); vals.push(due_date || null); }
        if (is_done !== undefined) { updates.push("is_done=?"); vals.push(is_done ? 1 : 0); }
        if (!updates.length) return res.status(400).json({ success: false, message: "Nothing to update." });

        vals.push(req.params.taskId);
        await pool.query(`UPDATE ticket_tasks SET ${updates.join(",")} WHERE id=?`, vals);

        if (is_done !== undefined) {
            await pool.query(
                `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,?,?,?)`,
                [req.params.id, 'task_updated', req.user.userId,
                 `Task "${rows[0].title}" marked as ${is_done ? 'done' : 'pending'}`]
            );
        }

        return res.json({ success: true, message: "Task updated." });
    } catch (err) {
        console.error("updateTask:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/tickets/:id/escalate
export const escalateTicket = async (req, res) => {
    const { reason } = req.body;
    try {
        const pool = connectDB();
        const [rows] = await pool.query(`SELECT * FROM tickets WHERE id=?`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: "Ticket not found." });

        const ticket = rows[0];
        const newLevel = Math.min(ticket.escalation_level + 1, 4);

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

        if (newAssignee && newAssignee !== ticket.assigned_to) {
            await createNotification(pool, {
                user_id: newAssignee,
                type: 'ticket_assigned',
                title: `Escalated Ticket Assigned: ${ticket.ticket_number}`,
                body: `Ticket ${ticket.ticket_number} has been escalated to Level ${newLevel} and assigned to you.`,
                entity_id: req.params.id
            });
        }

        return res.json({ success: true, message: `Ticket escalated to Level ${newLevel}.`, escalation_level: newLevel });
    } catch (err) {
        console.error("escalateTicket:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/tickets/queue/str
export const getSTRQueue = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT t.id, t.ticket_number, t.priority as priority_name, t.status, t.escalation_level, t.sla_state, t.str, t.etr,
              u.name as assigned_to_name, u.role as assigned_role,
              c.name as customer_name, p.name as project_name,
              q.name as queue_name,
              pri.color_code, cat.prefix as series_prefix
       FROM tickets t
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN queues q ON t.queue_id = q.id
       LEFT JOIN priorities pri ON t.priority_id = pri.id
       LEFT JOIN sla_priority_categories cat ON pri.category_id = cat.id
       WHERE t.status IN ('open','in_progress')
       ORDER BY cat.sort_order ASC, pri.level ASC, t.str ASC`
        );
        return res.json({ success: true, queue: rows });
    } catch (err) {
        console.error("getSTRQueue:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/tickets/import
export const importTickets = async (req, res) => {
    try {
        const pool = connectDB();
        const { rows } = req.body;
        if (!Array.isArray(rows) || rows.length === 0)
            return res.status(400).json({ success: false, message: "No rows provided." });

        const normPriority = (v = "") => {
            const u = String(v).trim().toUpperCase();
            if (/^P\d{1,3}$/.test(u)) return u;
            if (u === "CRITICAL") return "P1";
            if (u === "HIGH") return "P2";
            if (["MEDIUM", "NORMAL"].includes(u)) return "P3";
            if (u === "LOW") return "P4";
            if (["MINIMAL", "VERY LOW"].includes(u)) return "P5";
            return "P3";
        };

        const [allCustomers] = await pool.query("SELECT id, name, customer_code FROM customers WHERE is_deleted = 0");
        const [allUsers] = await pool.query("SELECT id, name, email FROM users WHERE role='agent' AND is_active = 1");
        
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

                const [projects] = await pool.query("SELECT id, name FROM projects WHERE customer_id=? AND is_deleted = 0", [customer.id]);
                const project = projects.find(p => p.name.toLowerCase() === (row.project || "").toLowerCase().trim());
                if (!project) { failed.push({ row: rowNum, reason: `Project not found: "${row.project}" under ${customer.name}` }); continue; }

                if (!row.category?.trim()) { failed.push({ row: rowNum, reason: "category is required" }); continue; }
                if (!row.description?.trim()) { failed.push({ row: rowNum, reason: "description is required" }); continue; }
                
                const priorityName = normPriority(row.priority);
                const [prioRows] = await pool.query(`SELECT id FROM priorities WHERE name = ?`, [priorityName]);
                if (!prioRows.length) { failed.push({ row: rowNum, reason: `Invalid priority: ${priorityName}` }); continue; }
                const priorityId = prioRows[0].id;

                const assigned_to = findUser(row.assigned_to)?.id || req.user.userId;
                
                const { resolveSlaPolicy, getSlaCalendar, generateTicketNumber, resolveTicketTimezone } = await import("../sla/slaPolicyService.js");
                const { SlaCalculator } = await import("../../services/sla/calculator.js");

                const resolvedTz = await resolveTicketTimezone(pool, { customerId: customer.id, projectId: project.id });
                const slaPolicy = await resolveSlaPolicy(pool, { customerId: customer.id, projectId: project.id, priorityId });
                const calendar = await getSlaCalendar(pool);
                const calculator = new SlaCalculator(pool);
                
                const nowStr = moment().tz(TZ).format("YYYY-MM-DD HH:mm:ss");
                const etrMoment = calculator.computeDueDate(nowStr, slaPolicy.resolution_hrs, calendar);
                const etr = etrMoment.format("YYYY-MM-DD HH:mm:ss");

                const [dupes] = await pool.query(
                    `SELECT id FROM tickets WHERE customer_id=? AND project_id=? AND description=? AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) LIMIT 1`,
                    [customer.id, project.id, row.description.trim()]
                );
                if (dupes.length > 0) { failed.push({ row: rowNum, reason: `Potential duplicate ticket found (ID: ${dupes[0].id})` }); continue; }

                const ticketNumber = await generateTicketNumber(pool, priorityId);

                const [result] = await pool.query(`
                    INSERT INTO tickets (
                        ticket_number, customer_id, project_id, category, priority_id, description, 
                        source, assigned_to, etr, status, escalation_level, sla_state, created_by,
                        resolved_timezone, sla_policy_id, sla_version
                    )
                    VALUES (?,?,?,?,?,?,'csv',?,?, 'open', 1, 'active', ?, ?, ?, ?)`,
                    [
                        ticketNumber, customer.id, project.id, row.category.trim(), priorityId, row.description.trim(), 
                        assigned_to, etr, req.user.userId,
                        resolvedTz, slaPolicy.id, slaPolicy.version
                    ]
                );

                const ticketId = result.insertId;

                // Auto-create conversation
                await pool.query(
                    `INSERT INTO conversations (ticket_id, source_channel) VALUES (?,'email')`,
                    [ticketId]
                );

                if (row.notes?.trim()) {
                    await pool.query(
                        "INSERT INTO ticket_activities (ticket_id, performed_by, action, note) VALUES (?,?,?,?)",
                        [ticketId, req.user.userId, "note_added", row.notes.trim()]
                    );
                }

                const cleanEmail = row.email?.replace(/[\[\]]/g, "").trim();
                const cleanPhone = row.phone?.replace(/[\[\]]/g, "").trim();

                if (cleanEmail) {
                    const tempTicket = { id: ticketId, ticket_number: ticketNumber, category: row.category, priority, description: row.description, etr };
                    sendTicketNotification(tempTicket, cleanEmail).catch(e => logger.error(`Import Email Notify Fail: ${e.message}`));
                }

                if (cleanPhone) {
                    logger.info(`📱 SMS NOTIFICATION SIMULATED for ${cleanPhone}: Ticket ${ticketNumber} created.`);
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

// GET /api/tickets/export
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
            SELECT t.ticket_number, t.status, pri.name as priority, t.category, t.source, t.sla_state,
                   t.escalation_level, t.description, t.etr, t.created_at, t.updated_at,
                   c.name as customer, p.name as project,
                   u.name as assigned_to, q.name as queue_name
            FROM tickets t
            LEFT JOIN customers c  ON t.customer_id  = c.id
            LEFT JOIN projects  p  ON t.project_id   = p.id
            LEFT JOIN users     u  ON t.assigned_to  = u.id
            LEFT JOIN queues    q  ON t.queue_id     = q.id
            LEFT JOIN priorities pri ON t.priority_id = pri.id
            WHERE ${filters.join(" AND ")}
            ORDER BY t.created_at DESC`, params);

        const headers = ["ticket_number", "customer", "project", "queue_name", "category", "priority", "status", "sla_state", "source", "escalation_level", "assigned_to", "description", "etr", "created_at"];
        const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        let csv = headers.join(",") + "\n";
        for (const r of rows) csv += headers.map(h => escape(r[h])).join(",") + "\n";

        const filename = `tickets_export_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(csv);
    } catch (err) {
        console.error("exportTickets:", err);
        return res.status(500).json({ success: false, message: "Export error: " + err.message });
    }
};

// PUT /api/tickets/bulk
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
        if (!updates.length) return res.status(400).json({ success: false, message: "Nothing to update." });

        updates.push("updated_at=NOW()");
        const placeholders = ids.map(() => "?").join(",");
        
        // Fetch ticket details for notification before updating
        const [rows] = await pool.query(
            `SELECT t.id, t.ticket_number, t.category, c.email as customer_email 
             FROM tickets t LEFT JOIN customers c ON t.customer_id = c.id 
             WHERE t.id IN (${placeholders})`, 
            ids
        );

        vals.push(...ids);
        await pool.query(`UPDATE tickets SET ${updates.join(",")} WHERE id IN (${placeholders})`, vals);

        if (status) {
            for (const r of rows) {
                if (r.customer_email) {
                    sendTicketStatusNotification(r, r.customer_email, r.status || 'open', status).catch(e => logger.error(`Bulk Status Email Fail: ${e.message}`));
                }
            }
        }

        return res.json({ success: true, message: `${ids.length} ticket(s) updated.`, updated: ids.length });
    } catch (err) {
        console.error("bulkUpdateTickets:", err);
        return res.status(500).json({ success: false, message: "Bulk update error: " + err.message });
    }
};

// PUT /api/tickets/:id/sla-hold
export const slaHold = async (req, res) => {
    const { action, reason } = req.body;
    const { id } = req.params;

    if (!['pause', 'resume'].includes(action)) {
        return res.status(400).json({ success: false, message: "Action must be 'pause' or 'resume'." });
    }

    try {
        const pool = connectDB();
        const [tickets] = await pool.query(`SELECT * FROM tickets WHERE id=?`, [id]);
        if (!tickets.length) return res.status(404).json({ success: false, message: "Ticket not found." });

        const ticket = tickets[0];

        if (action === 'pause') {
            await pool.query(
                `UPDATE tickets SET sla_paused_manual=1, sla_paused_at=NOW(), sla_pause_reason=? WHERE id=?`,
                [reason || 'Manual hold', id]
            );
            await pool.query(
                `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,'sla_paused',?,?)`,
                [id, req.user.userId, `SLA paused manually: ${reason || 'No reason given'}`]
            );
            return res.json({ success: true, message: "SLA paused manually." });
        } else {
            if (!ticket.sla_paused_manual) {
                 return res.json({ success: true, message: "SLA is already active." });
            }
            const pausedAt = ticket.sla_paused_at ? moment(ticket.sla_paused_at).tz(TZ) : moment().tz(TZ);
            const nowMoment = moment().tz(TZ);
            const pausedMinutes = nowMoment.diff(pausedAt, "minutes");

            await pool.query(
                `UPDATE tickets SET sla_paused_manual=0, sla_paused_at=NULL, sla_pause_reason=NULL,
                 etr = DATE_ADD(etr, INTERVAL ? MINUTE) WHERE id=?`,
                [pausedMinutes, id]
            );
            await pool.query(
                `INSERT INTO ticket_activities (ticket_id, action, performed_by, note) VALUES (?,'sla_resumed',?,?)`,
                [id, req.user.userId, `SLA resumed manually. ETR extended by ${pausedMinutes} min.`]
            );
            return res.json({ success: true, message: "SLA resumed manually." });
        }
    } catch (err) {
        console.error("slaHold:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

/**
 * POST /api/tickets/:id/ping
 * Debug endpoint to test real-time Socket.io delivery to a specific ticket detail page.
 */
export const pingSocket = async (req, res) => {
    try {
        const { id } = req.params;
        const { broadcast } = await import("../../services/socketService.js");

        broadcast("new_message", {
            id: Date.now(), // Fake ID
            ticket_id: id,
            conversation_id: 0,
            sender_type: "agent",
            sender_name: "SYSTEM DEBUG",
            message_body: `📶 Real-time socket check at ${new Date().toLocaleTimeString()}. If you see this, your connection is LIVE!`,
            created_at: new Date().toISOString()
        });

        return res.json({ success: true, message: "Ping broadcasted to ticket " + id });
    } catch (err) {
        console.error("pingSocket error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};
