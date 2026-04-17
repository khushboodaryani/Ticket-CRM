// modules/approvals/approvalController.js
// Handles domain approval workflow for unknown sender domains.
// Superadmin reviews, approves (mapping domain→customer/project), or rejects.
// On approval: all held emails are released as tickets in chronological order.

import connectDB from "../../db/index.js";
import { logger } from "../../logger.js";
import { createNotification } from "../notifications/notificationController.js";
import { sendTicketNotification } from "../notifications/emailService.js";
import { getShiftAssignee } from "../../services/assignmentService.js";
import { resolveSlaPolicy, getSlaCalendar } from "../sla/slaPolicyService.js";
import moment from "moment-timezone";

const TZ = process.env.TIMEZONE || "Asia/Kolkata";

// GET /api/approvals/domains — list all domain approval requests
export const getDomainApprovals = async (req, res) => {
    try {
        const pool = connectDB();
        const { status } = req.query;

        let where = "1=1";
        const params = [];
        if (status) { where += " AND dar.status = ?"; params.push(status); }

        const [rows] = await pool.query(
            `SELECT dar.*,
                    c.name as approved_customer_name,
                    p.name as approved_project_name,
                    u.name as reviewed_by_name,
                    (SELECT COUNT(*) FROM held_emails he WHERE he.approval_request_id = dar.id) as held_email_count
             FROM domain_approval_requests dar
             LEFT JOIN customers c ON dar.approved_customer_id = c.id
             LEFT JOIN projects p ON dar.approved_project_id = p.id
             LEFT JOIN users u ON dar.reviewed_by = u.id
             WHERE ${where}
             ORDER BY dar.status = 'pending' DESC, dar.created_at DESC`,
            params
        );

        return res.json({ success: true, requests: rows });
    } catch (err) {
        console.error("getDomainApprovals:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/approvals/domains/pending-count — count of pending requests (for badge)
export const getPendingCount = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT COUNT(*) as count FROM domain_approval_requests WHERE status = 'pending'`
        );
        return res.json({ success: true, count: rows[0].count });
    } catch (err) {
        console.error("getPendingCount:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/approvals/domains/:id — get approval detail with held emails
export const getApprovalDetail = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT dar.*,
                    c.name as approved_customer_name,
                    p.name as approved_project_name,
                    u.name as reviewed_by_name
             FROM domain_approval_requests dar
             LEFT JOIN customers c ON dar.approved_customer_id = c.id
             LEFT JOIN projects p ON dar.approved_project_id = p.id
             LEFT JOIN users u ON dar.reviewed_by = u.id
             WHERE dar.id = ?`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: "Request not found." });

        const [heldEmails] = await pool.query(
            `SELECT * FROM held_emails WHERE approval_request_id = ? ORDER BY received_at ASC`,
            [req.params.id]
        );

        return res.json({ success: true, request: rows[0], held_emails: heldEmails });
    } catch (err) {
        console.error("getApprovalDetail:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/approvals/domains/:id/approve
// Approves the domain, maps it to a customer+project, then auto-creates tickets from all held emails.
export const approveDomain = async (req, res) => {
    const { customer_id, project_id } = req.body;

    if (!customer_id) {
        return res.status(400).json({ success: false, message: "customer_id is required." });
    }

    const pool = connectDB();
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        // 1. Verify the request exists and is pending
        const [requests] = await conn.query(
            'SELECT * FROM domain_approval_requests WHERE id = ? AND status = "pending"',
            [req.params.id]
        );
        if (!requests.length) {
            conn.release();
            return res.status(404).json({ success: false, message: "Pending request not found." });
        }
        const request = requests[0];
        const domain = request.domain;

        // 2. Verify customer exists
        const [cust] = await conn.query('SELECT id, name, default_project_id FROM customers WHERE id = ?', [customer_id]);
        if (!cust.length) {
            conn.release();
            return res.status(400).json({ success: false, message: "Customer not found." });
        }

        // 3. Determine effective project_id
        let effectiveProjectId = project_id || null;
        if (!effectiveProjectId) {
            effectiveProjectId = cust[0].default_project_id;
        }
        if (!effectiveProjectId) {
            // Find any project under this customer as fallback
            const [fallbackProjects] = await conn.query(
                'SELECT id FROM projects WHERE customer_id = ? AND is_deleted = 0 LIMIT 1', [customer_id]
            );
            if (fallbackProjects.length) {
                effectiveProjectId = fallbackProjects[0].id;
            } else {
                // If NO projects exist, we allow it to be NULL (mapping to Customer Root)
                logger.info(`[Approval] Customer ${customer_id} has no active projects. Mapping domain to Customer Root (project_id=NULL).`);
                effectiveProjectId = null;
            }
        }

        // 4. Create the domain mapping
        try {
            await conn.query(
                `INSERT INTO customer_domains (customer_id, project_id, domain) VALUES (?, ?, ?)`,
                [customer_id, project_id || null, domain]
            );
        } catch (dupErr) {
            if (dupErr.code === 'ER_DUP_ENTRY') {
                logger.info(`[Approval] Domain ${domain} already mapped — skipping insert.`);
            } else {
                throw dupErr;
            }
        }

        // 5. Mark the request as approved
        await conn.query(
            `UPDATE domain_approval_requests 
             SET status = 'approved', approved_customer_id = ?, approved_project_id = ?, 
                 reviewed_by = ?, reviewed_at = NOW() 
             WHERE id = ?`,
            [customer_id, effectiveProjectId, req.user.userId, req.params.id]
        );

        // 6. Fetch all held emails for this request (chronological order)
        const [heldEmails] = await conn.query(
            `SELECT * FROM held_emails WHERE approval_request_id = ? AND processed_at IS NULL ORDER BY received_at ASC`,
            [req.params.id]
        );

        // 7. Also check for OTHER pending requests with the same domain and approve them too
        const [siblingRequests] = await conn.query(
            `SELECT id FROM domain_approval_requests WHERE domain = ? AND status = 'pending' AND id != ?`,
            [domain, req.params.id]
        );
        for (const sibling of siblingRequests) {
            await conn.query(
                `UPDATE domain_approval_requests 
                 SET status = 'approved', approved_customer_id = ?, approved_project_id = ?, 
                     reviewed_by = ?, reviewed_at = NOW() 
                 WHERE id = ?`,
                [customer_id, effectiveProjectId, req.user.userId, sibling.id]
            );
        }

        // Fetch held emails from siblings too
        if (siblingRequests.length > 0) {
            const siblingIds = siblingRequests.map(s => s.id);
            const [siblingEmails] = await conn.query(
                `SELECT * FROM held_emails WHERE approval_request_id IN (?) AND processed_at IS NULL ORDER BY received_at ASC`,
                [siblingIds]
            );
            heldEmails.push(...siblingEmails);
            // Re-sort by received_at
            heldEmails.sort((a, b) => new Date(a.received_at) - new Date(b.received_at));
        }

        // 8. Create tickets from all held emails
        const systemUserId = parseInt(process.env.EMAIL_SYSTEM_USER_ID || '5', 10);
        const defaultPriority = process.env.EMAIL_DEFAULT_PRIORITY || 'P3';
        const createdTickets = [];

        for (const held of heldEmails) {
            try {
                const rawSubject = held.subject || 'No Subject';
                const cleanSubject = rawSubject
                    .replace(/^(re|fwd?|reply):\s*/i, '')
                    .trim() || 'General Inquiry';
                const description = (held.body || rawSubject).slice(0, 5000);

                // Determine priority
                let priority = defaultPriority;
                const emergencyKeywords = ['server down', 'emergency', 'outage', 'critical', 'urgent', 'crashed'];
                if (emergencyKeywords.some(kw => rawSubject.toLowerCase().includes(kw) || (held.body || '').toLowerCase().includes(kw))) {
                    priority = 'P1';
                }

                // Generate ticket number
                const today = moment().tz(TZ).format('YYYYMMDD');
                const lockName = `ticket_seq_${today}`;
                await conn.query(`SELECT GET_LOCK(?, 5)`, [lockName]);
                let ticketNumber;
                try {
                    const [countRow] = await conn.query(`SELECT COUNT(*) as cnt FROM tickets WHERE DATE(created_at) = CURDATE()`);
                    const seq = String(countRow[0].cnt + 1).padStart(4, '0');
                    ticketNumber = `TKT-${today}-${seq}`;
                } finally {
                    await conn.query(`SELECT RELEASE_LOCK(?)`, [lockName]);
                }

                const { SlaCalculator } = await import("../../services/sla/calculator.js");
                const [prioRows] = await conn.query(`SELECT id FROM priorities WHERE name = ?`, [priority]);
                const priorityId = prioRows[0]?.id;
                
                const slaPolicy = await resolveSlaPolicy(conn, { customerId: customer_id, projectId: effectiveProjectId, priorityId });
                const calendar = await getSlaCalendar(conn);
                const calculator = new SlaCalculator(conn);
                
                const nowStr = moment().tz(TZ).format('YYYY-MM-DD HH:mm:ss');
                const etrMoment = calculator.computeDueDate(nowStr, slaPolicy.resolution_hrs, calendar);
                const etr = etrMoment.format('YYYY-MM-DD HH:mm:ss');

                let assigneeId = null;
                try { assigneeId = await getShiftAssignee(priority); } catch (_) {}

                // Create ticket
                const [tResult] = await conn.query(
                    `INSERT INTO tickets (ticket_number, subject, customer_id, project_id, category, priority_id, description, 
                     status, escalation_level, sla_state, str, etr, created_by, assigned_to, source,
                     resolved_timezone, sla_policy_id, sla_version)
                     VALUES (?,?,?,?,?,?,?, 'open', 1, 'active', ?, ?, ?, ?, 'email', ?, ?, ?)`,
                    [ticketNumber, rawSubject.slice(0, 500), customer_id, effectiveProjectId,
                     cleanSubject.slice(0, 250), priorityId, description, nowStr, etr, systemUserId, assigneeId,
                     TZ, slaPolicy.id, slaPolicy.version]
                );
                const ticketId = tResult.insertId;

                // Create conversation
                const [cvResult] = await conn.query(
                    `INSERT INTO conversations (ticket_id, source_channel, root_message_id, customer_id) VALUES (?,?,?,?)`,
                    [ticketId, 'email', held.message_id, customer_id]
                );
                const conversationId = cvResult.insertId;

                // Create initial message
                await conn.query(
                    `INSERT INTO conversation_messages (conversation_id, sender_type, sender_name, message_body, message_id, in_reply_to, reference_chain)
                     VALUES (?, 'customer', ?, ?, ?, ?, ?)`,
                    [conversationId, held.sender_name || held.sender_email, held.body || '',
                     held.message_id, held.in_reply_to, held.reference_chain]
                );

                // Add sender as participant
                await conn.query(
                    `INSERT INTO conversation_participants (conversation_id, email, type) VALUES (?, ?, 'to')`,
                    [conversationId, held.sender_email.toLowerCase()]
                );

                // Activity log
                await conn.query(
                    'INSERT INTO ticket_activities (ticket_id, action, note) VALUES (?, "created", ?)',
                    [ticketId, `Auto-created from approved domain: ${domain} (held email released)`]
                );

                // Mark held email as processed
                await conn.query(
                    'UPDATE held_emails SET processed_at = NOW() WHERE id = ?',
                    [held.id]
                );

                createdTickets.push({ ticketId, ticketNumber, sender: held.sender_email, subject: rawSubject });

                // Notify assigned agent
                if (assigneeId) {
                    try {
                        await createNotification(pool, {
                            user_id: assigneeId,
                            type: 'ticket_assigned',
                            title: `Auto-Assigned: ${ticketNumber}`,
                            body: `Released from domain approval: ${cleanSubject}`,
                            entity_id: ticketId
                        });
                    } catch (_) {}
                }
            } catch (ticketErr) {
                logger.error(`[Approval] Failed to create ticket from held email ${held.id}: ${ticketErr.message}`);
            }
        }

        await conn.commit();

        // Post-commit: send acknowledgement emails for created tickets (non-blocking)
        for (const ct of createdTickets) {
            const ticketObj = {
                id: ct.ticketId,
                ticket_number: ct.ticketNumber,
                category: ct.subject?.replace(/^(re|fwd?|reply):\s*/i, '').slice(0, 250) || 'General Inquiry',
                priority: defaultPriority,
                description: ct.subject,
                etr: moment().tz(TZ).add(2, 'hours').format('YYYY-MM-DD HH:mm:ss')
            };
            sendTicketNotification(ticketObj, ct.sender).catch(err =>
                logger.error(`[Approval] Ack email failed for ${ct.ticketNumber}: ${err.message}`)
            );
        }

        // Broadcast real-time update
        try {
            const { broadcast } = await import("../../services/socketService.js");
            broadcast('domain_approved', { domain, customer_id, tickets_created: createdTickets.length });
        } catch (_) {}

        return res.json({
            success: true,
            message: `Domain '${domain}' approved and mapped to customer. ${createdTickets.length} ticket(s) created from held emails.`,
            domain,
            tickets_created: createdTickets.length,
            tickets: createdTickets
        });

    } catch (err) {
        try { await conn.rollback(); } catch (_) {}
        console.error("approveDomain:", err);
        return res.status(500).json({ success: false, message: "Server error: " + err.message });
    } finally {
        try { conn.release(); } catch (_) {}
    }
};

// POST /api/approvals/domains/:id/reject
// Rejects the domain request and sends polite auto-reply to sender.
export const rejectDomain = async (req, res) => {
    const { reason } = req.body;
    const pool = connectDB();

    try {
        const [requests] = await pool.query(
            'SELECT * FROM domain_approval_requests WHERE id = ? AND status = "pending"',
            [req.params.id]
        );
        if (!requests.length) {
            return res.status(404).json({ success: false, message: "Pending request not found." });
        }
        const request = requests[0];

        // Mark as rejected
        await pool.query(
            `UPDATE domain_approval_requests 
             SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW() 
             WHERE id = ?`,
            [req.user.userId, req.params.id]
        );

        // Also reject siblings with same domain
        await pool.query(
            `UPDATE domain_approval_requests 
             SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW() 
             WHERE domain = ? AND status = 'pending'`,
            [req.user.userId, request.domain]
        );

        // Fetch unique sender emails from held emails
        const [heldEmails] = await pool.query(
            `SELECT DISTINCT sender_email FROM held_emails WHERE approval_request_id = ?`,
            [req.params.id]
        );
        const senderEmails = new Set([request.sender_email, ...heldEmails.map(h => h.sender_email)]);

        // Send rejection notice to all unique senders
        try {
            const nodemailer = await import('nodemailer');
            const transporter = nodemailer.default.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }
            });

            for (const email of senderEmails) {
                const mailOptions = {
                    from: `"Support Team" <${process.env.EMAIL_USER}>`,
                    to: email,
                    subject: `Re: ${request.email_subject || 'Your Support Request'}`,
                    headers: {
                        'Auto-Submitted': 'auto-generated',
                        'X-Auto-Response-Suppress': 'All'
                    },
                    html: `
                        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #4f8ef7; margin-bottom: 4px;">Message Not Delivered</h2>
                            <p style="color: #64748b; margin-top: 8px;">
                                Thank you for reaching out. Unfortunately, your message could not be delivered to our support team 
                                as your email domain is not currently registered in our system.
                            </p>
                            <div style="background: #fef3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin: 20px 0;">
                                <p style="margin: 0; font-size: 14px; color: #856404;">
                                    Please contact your account manager to get your domain registered for support access.
                                </p>
                            </div>
                            ${reason ? `<p style="font-size: 13px; color: #64748b;">Reason: ${reason}</p>` : ''}
                            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
                            <p style="font-size: 12px; color: #999;">Regards,<br/><strong>Team Multycomm</strong></p>
                        </div>
                    `
                };

                await transporter.sendMail(mailOptions);
                logger.info(`[Approval] Rejection notice sent to ${email} for domain ${request.domain}`);
            }
        } catch (emailErr) {
            logger.error(`[Approval] Failed to send rejection email: ${emailErr.message}`);
        }

        return res.json({
            success: true,
            message: `Domain '${request.domain}' rejected. Rejection notice sent to ${senderEmails.size} sender(s).`,
            domain: request.domain
        });
    } catch (err) {
        console.error("rejectDomain:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
