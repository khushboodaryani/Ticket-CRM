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

    // Supported Triggers
    const triggers = ['ticket_created', 'ticket_updated', 'status_changed', 'sla_breached'];

    triggers.forEach(trigger => {
        workflowEvents.on(trigger, async (data) => {
            try {
                // 1. Core Workflow Processing (Business Rules)
                await processWorkflows(trigger, data);

                // 2. Automated Communication Hooks
                if (trigger === 'status_changed') {
                    await handleStatusChangeNotification(data);
                } else if (trigger === 'ticket_created') {
                    await handleTicketCreatedNotification(data);
                }
            } catch (err) {
                logger.error(`❌ Workflow execution error [${trigger}]:`, err.message);
            }
        });
    });
};

/**
 * Handle sending acknowledgement emails for new tickets
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
        await sendTicketNotification(ticket, ticket.customer_email);
        logger.info(`📧 Acknowledgement email sent to ${ticket.customer_email} for new ticket ${ticket.ticket_number}`);
    }
}

/**
 * Handle sending status change emails to customers
 */
async function handleStatusChangeNotification({ ticketId, payload }) {
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
        await sendTicketStatusNotification(
            ticket, 
            ticket.customer_email, 
            payload.old_status, 
            payload.new_status
        );
        logger.info(`📧 Status change email sent to ${ticket.customer_email} for ${ticket.ticket_number}`);
    }
}

/**
 * Process all active workflows for a specific trigger
 */
async function processWorkflows(trigger, data) {
    const pool = connectDB();
    const { ticketId, payload } = data;

    // 0. EMERGENCY BYPASS: P1 Priority tickets skip all automation to remain Unassigned
    // for the 1st-Responder Claim broadcast workflow.
    if (payload?.priority === 'P1') {
        logger.info(`🚨 Skipping Workflow Rules for P1 Ticket #${ticketId} to preserve Unassigned Crisis pool.`);
        return;
    }

    // 1. Fetch active rules for this trigger
    const [rules] = await pool.query(
        "SELECT * FROM workflow_rules WHERE trigger_event = ? AND is_active = 1",
        [trigger]
    );

    for (const rule of rules) {
        try {
            // 2. Evaluate Conditions
            const conditionsMet = evaluateConditions(rule.conditions, payload);
            
            if (conditionsMet) {
                logger.info(`🎯 Workflow Match: "${rule.name}" for Ticket #${ticketId}`);
                
                // 3. Execute Actions
                const results = await executeActions(pool, rule.actions, ticketId);
                
                // 4. Log Run
                await pool.query(
                    "INSERT INTO workflow_runs (rule_id, ticket_id, status, run_log) VALUES (?,?,?,?)",
                    [rule.id, ticketId, 'success', JSON.stringify(results)]
                );
            } else {
                // Optional: Log skipped
            }
        } catch (err) {
            logger.error(`❌ Rule "${rule.name}" failed:`, err.message);
            await pool.query(
                "INSERT INTO workflow_runs (rule_id, ticket_id, status, run_log) VALUES (?,?,?,?)",
                [rule.id, ticketId, 'failed', err.message]
            );
        }
    }
}

/**
 * Evaluate if conditions match the payload
 * Currently support basic key-value matching
 */
function evaluateConditions(conditions, payload) {
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
 * Execute a sequence of actions on a ticket
 */
async function executeActions(pool, actions, ticketId) {
    const runLogs = [];
    
    for (const action of actions) {
        const { type, value } = action;
        
        switch (type) {
            case 'update_status':
                await pool.query("UPDATE tickets SET status = ? WHERE id = ?", [value, ticketId]);
                runLogs.push(`Status updated to ${value}`);
                break;
                
            case 'assign_to':
                await pool.query("UPDATE tickets SET assigned_to = ? WHERE id = ?", [value, ticketId]);
                runLogs.push(`Assigned to user ID ${value}`);
                break;
                
            case 'add_internal_note':
                // We'd need to fetch or create a conversation first
                // For now, let's just log the intent
                runLogs.push(`Added internal note: ${value}`);
                break;
                
            default:
                runLogs.push(`Unknown action type: ${type}`);
        }
    }
    
    return runLogs;
}
