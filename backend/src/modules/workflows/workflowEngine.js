// src/modules/workflows/workflowEngine.js
import EventEmitter from "events";
import connectDB from "../../db/index.js";
import { logger } from "../../logger.js";

class WorkflowEventEmitter extends EventEmitter {}
export const workflowEvents = new WorkflowEventEmitter();

/**
 * Core Workflow Engine
 * Listens for system events and executes matching rules
 */
export const initWorkflowEngine = () => {
    logger.info("⚙️ Workflow Engine Initialized.");

    workflowEvents.on('ticket_created', async (data) => {
        try {
            // 8-Step Enterprise Ingestion Pipeline
            await processEnterpriseWorkflow('ticket_created', data);
        } catch (err) {
            logger.error(`❌ Workflow Engine Error:`, err.message);
        }

        // GUARANTEED Step 7: Always send acknowledgment, even if workflow failed
        // This runs AFTER the pipeline completes (success or failure)
        try {
            await handleTicketCreatedNotification({ ticketId: data.ticketId });
        } catch (notifErr) {
            logger.error(`❌ Acknowledgment notification failed for Ticket #${data.ticketId}: ${notifErr.message}`);
        }
    });

    workflowEvents.on('status_changed', async (data) => {
        try {
            await handleStatusChangeNotification(data);
        } catch (err) {
            logger.error(`❌ Status Change Notification Error:`, err.message);
        }
    });
};

/**
 * 8-Step Enterprise Pipeline Orchestrator
 */
export async function processEnterpriseWorkflow(trigger, data) {
    const pool = connectDB();
    const { ticketId, payload } = data;
    const lockName = `ticket_workflow_${ticketId}`;

    let conn;
    try {
        conn = await pool.getConnection();

        // Step 3a: Acquire Lock (Prevent Race Conditions)
        const [lockResult] = await conn.query("SELECT GET_LOCK(?, 10) as locked", [lockName]);
        if (!lockResult[0].locked) {
            logger.warn(`[Workflow] Could not acquire lock for ticket ${ticketId}. Skipping.`);
            return;
        }

        // Step 3b: Check Idempotency
        const [ticketRows] = await conn.query(
            "SELECT id, workflow_processed, project_id, customer_id, priority, priority_id, queue_id, assignment_source FROM tickets WHERE id = ?",
            [ticketId]
        );
        const ticket = ticketRows[0];

        if (!ticket || ticket.workflow_processed) {
            logger.info(`[Workflow] Ticket ${ticketId} already processed or missing. Standing down.`);
            return;
        }

        // Step 3c: Fetch Rules Deterministically
        const [rules] = await conn.query(
            "SELECT * FROM workflow_rules WHERE trigger_event = ? AND is_active = 1 ORDER BY priority DESC, id ASC",
            [trigger]
        );

        // Step 3d: Pick FIRST MATCH Only
        let matchedRule = null;
        for (const rule of rules) {
            // Defensive Parsing: Ensure conditions/actions are objects
            let parsedConditions = rule.conditions;
            if (typeof parsedConditions === 'string') {
                try { parsedConditions = JSON.parse(parsedConditions); } catch { parsedConditions = {}; }
            }

            if (evaluateConditions(parsedConditions, payload)) {
                matchedRule = rule;
                // Parse actions too for Step 4
                if (typeof matchedRule.actions === 'string') {
                    try { matchedRule.actions = JSON.parse(matchedRule.actions); } catch { matchedRule.actions = []; }
                }
                break; 
            }
        }

        // Step 4: Transactional Apply
        await conn.beginTransaction();

        let finalPriority = payload.priority || ticket.priority;
        let finalQueueId = payload.queue_id ?? ticket.queue_id;
        let finalStatus = payload.status || 'open';
        let runLogs = [];

        if (matchedRule) {
            logger.info(`🎯 Workflow Match: "${matchedRule.name}" for Ticket #${ticketId}`);
            runLogs.push(`Matched Rule: ${matchedRule.name}`);

            for (const action of matchedRule.actions) {
                if (action.type === 'route_to_queue') {
                    finalQueueId = action.value;
                    runLogs.push(`Routed to Queue: ${finalQueueId}`);
                } else if (action.type === 'update_priority') {
                    finalPriority = action.value;
                    runLogs.push(`Priority Set: ${finalPriority}`);
                } else if (action.type === 'update_status') {
                    finalStatus = action.value;
                }
            }
        } else {
            runLogs.push("No matching rules found.");
        }

        // Step 4b: Fallback Queue
        if (!finalQueueId) {
            const [settings] = await conn.query("SELECT setting_value FROM system_settings WHERE setting_key = 'DEFAULT_QUEUE_ID'");
            if (settings.length) {
                finalQueueId = parseInt(settings[0].setting_value, 10);
                runLogs.push(`Applied Default Queue: ${finalQueueId}`);
            }
        }

        // Step 4c: Compute SLA (Enterprise 2.1)
        const { resolveSlaPolicy, getSlaCalendar, resolveTicketTimezone } = await import("../sla/slaPolicyService.js");
        const { SlaCalculator } = await import("../../services/sla/calculator.js");

        // Resolve new priority record
        const [prioRows] = await conn.query(`SELECT id FROM priorities WHERE name = ?`, [finalPriority]);
        const priorityId = prioRows[0]?.id || ticket.priority_id;

        const slaPolicy = await resolveSlaPolicy(conn, {
            customerId: ticket.customer_id,
            projectId: ticket.project_id,
            priorityId: priorityId
        });

        const resolvedTz = await resolveTicketTimezone(conn, { 
            customerId: ticket.customer_id, 
            projectId: ticket.project_id 
        });

        const calendar = await getSlaCalendar(conn);
        const calendarForTicket = { ...calendar, timezone: resolvedTz || calendar?.timezone };
        const calculator = new SlaCalculator(conn);
        const now = new Date();
        const etrMoment = calculator.computeDueDate(now, slaPolicy.resolution_hrs, calendarForTicket);
        const strMoment = calculator.computeDueDate(now, slaPolicy.first_response_hrs, calendarForTicket);
        const finalEtr = etrMoment.format("YYYY-MM-DD HH:mm:ss");
        const finalStr = strMoment.format('YYYY-MM-DD HH:mm:ss');

        runLogs.push(`SLA Recalculated: ${finalEtr} (TZ: ${resolvedTz})`);

        // Step 4d: Atomic Save
        await conn.query(
            `UPDATE tickets SET 
                priority = ?,
                priority_id = ?, 
                queue_id = ?, 
                status = ?, 
                str = ?,
                etr = ?, 
                resolved_timezone = ?,
                sla_policy_id = ?,
                sla_version = ?,
                workflow_processed = 1 
             WHERE id = ?`,
            [finalPriority, priorityId, finalQueueId, finalStatus, finalStr, finalEtr, resolvedTz, slaPolicy.id, slaPolicy.version, ticketId]
        );

        // Step 4e: Rich Activity Trace (for UI visibility)
        const traceNote = matchedRule 
            ? `Automation "${matchedRule.name}" applied. Priority: ${finalPriority}, Queue: ${finalQueueId}, ETR: ${finalEtr}.`
            : `No automation matched. Initializing with Default Queue (${finalQueueId}) & ETR: ${finalEtr}.`;
        
        await conn.query(
            "INSERT INTO ticket_activities (ticket_id, action, note) VALUES (?, 'automation', ?)",
            [ticketId, traceNote]
        );

        if (matchedRule) {
            await conn.query(
                "INSERT INTO workflow_runs (rule_id, ticket_id, status, run_log) VALUES (?,?,?,?)",
                [matchedRule.id, ticketId, 'success', JSON.stringify(runLogs)]
            );
        }

        // Step 5: Commit
        await conn.commit();
        logger.info(`✅ Enterprise Pipeline complete for Ticket #${ticketId}`);

        try {
            const { jobManager } = await import("../../services/sla/jobManager.js");
            await jobManager.scheduleJobs({ id: ticketId, etr: finalEtr, resolved_timezone: resolvedTz }, calendarForTicket);
        } catch (scheduleErr) {
            logger.error(`[Workflow] Failed to schedule SLA jobs for ticket ${ticketId}: ${scheduleErr.message}`);
        }

        // Step 6: Assignment Engine (Lazy)
        if (ticket.assignment_source === 'auto') {
            try {
                const { getShiftAssignee } = await import("../../services/assignmentService.js");
                const assigneeId = await getShiftAssignee(finalQueueId, finalPriority);
                if (assigneeId) {
                    await pool.query("UPDATE tickets SET assigned_to = ? WHERE id = ?", [assigneeId, ticketId]);
                    await pool.query(
                        "INSERT INTO ticket_activities (ticket_id, action, note) VALUES (?, 'assigned', ?)",
                        [ticketId, `Auto-assigned via Enterprise Pipeline (Queue: ${finalQueueId})`]
                    );
                    logger.info(`👤 Auto-assigned Ticket #${ticketId} to agent ${assigneeId}`);

                    // Step 6b: Notify customer about assignment (non-blocking)
                    try {
                        const [agentRow] = await pool.query("SELECT name FROM users WHERE id = ?", [assigneeId]);
                        const [ticketRow] = await pool.query(
                            `SELECT t.*, c.email as customer_email FROM tickets t LEFT JOIN customers c ON t.customer_id = c.id WHERE t.id = ?`,
                            [ticketId]
                        );
                        if (agentRow.length && ticketRow.length && ticketRow[0].customer_email) {
                            const { sendTicketAssignedNotification } = await import("../notifications/emailService.js");
                            sendTicketAssignedNotification(ticketRow[0], ticketRow[0].customer_email, agentRow[0].name)
                                .catch(e => logger.error(`❌ Assignment email failed (non-blocking): ${e.message}`));
                        }
                    } catch (notifErr) {
                        logger.error(`❌ Assignment notification lookup failed: ${notifErr.message}`);
                    }
                }
            } catch (assignErr) {
                logger.error(`❌ Auto-assignment failed: ${assignErr.message}`);
            }
        }

        // Step 7: Acknowledgment is now handled by the event listener (GUARANTEED)
        // Removed from here to prevent double-sending.

        // Final Release Lock
    } catch (err) {
        if (conn) await conn.rollback();
        logger.error(`❌ Enterprise Pipeline Failed for Ticket #${ticketId}:`, err.message);
        throw err;
    } finally {
        if (conn) {
            try {
                await conn.query("SELECT RELEASE_LOCK(?)", [lockName]);
            } catch (releaseErr) {
                logger.warn(`[Workflow] Failed to release lock for ticket ${ticketId}: ${releaseErr.message}`);
            }
            conn.release();
        }
    }
}

/**
 * Evaluate if conditions match the payload
 */
export function evaluateConditions(conditions, payload) {
    if (!conditions || Object.keys(conditions).length === 0) return true;

    for (const [key, expected] of Object.entries(conditions)) {
        const actual = payload[key];
        
        if (Array.isArray(expected)) {
            if (!expected.includes(actual)) return false;
        } else if (actual !== expected) {
            return false;
        }
    }
    return true;
}

/**
 * Handle sending acknowledgement emails for new tickets
 * Fetches the FINAL state after workflows have finished.
 */
async function handleTicketCreatedNotification({ ticketId }) {
    const pool = connectDB();
    const [rows] = await pool.query(
        `SELECT t.*, c.email as customer_email 
         FROM tickets t 
         LEFT JOIN customers c ON t.customer_id = c.id 
         WHERE t.id = ?`,
        [ticketId]
    );

    const ticket = rows[0];
    if (ticket && ticket.customer_email) {
        const { sendTicketNotification } = await import("../notifications/emailService.js");
        // This now carries the accurate, recalculated ETR!
        await sendTicketNotification(ticket, ticket.customer_email);
        logger.info(`📧 FINAL Acknowledgement sent to ${ticket.customer_email} for Ticket ${ticket.ticket_number}`);
    }
}

/**
 * Handle sending status update emails for existing tickets
 */
async function handleStatusChangeNotification(data) {
    const { ticketId, payload } = data;
    const { old_status, new_status } = payload;
    
    // Ignore internal automation updates that don't change actual user status visibility,
    // though the controller filter should already catch them.
    if (!old_status || !new_status || old_status === new_status) return;

    const pool = connectDB();
    const [rows] = await pool.query(
        `SELECT t.*, c.email as customer_email 
         FROM tickets t 
         LEFT JOIN customers c ON t.customer_id = c.id 
         WHERE t.id = ?`,
        [ticketId]
    );

    const ticket = rows[0];
    if (ticket && ticket.customer_email) {
        const { sendTicketStatusNotification } = await import("../notifications/emailService.js");
        await sendTicketStatusNotification(ticket, ticket.customer_email, old_status, new_status);
    }
}
