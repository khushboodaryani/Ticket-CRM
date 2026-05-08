// src/workers/assignmentWorker.js
import connectDB from '../db/index.js';
import { logger } from '../logger.js';
import { getShiftAssignee } from '../services/assignmentService.js';
import { broadcastEvent } from '../services/socketBroadcaster.js';

/**
 * The "Queue Sweeper"
 * Background job that periodically attempts to assign unassigned tickets
 * to agents who have just become active or have available capacity.
 */
export const startAssignmentSweeper = () => {
    // Run every 2 minutes. This provides a balance between responsiveness 
    // and database performance.
    const INTERVAL_MS = 60000 * 2;

    setInterval(async () => {
        const pool = connectDB();
        let conn;

        try {
            conn = await pool.getConnection();

            // 1. Find the oldest 50 unassigned active tickets
            const [unassigned] = await conn.query(
                `SELECT id, ticket_number, queue_id, priority, subject 
                 FROM tickets 
                 WHERE assigned_to IS NULL 
                 AND status NOT IN ('closed', 'resolved')
                 ORDER BY created_at ASC 
                 LIMIT 50`
            );

            if (unassigned.length === 0) return;

            logger.info(`[AssignmentSweeper] Found ${unassigned.length} unassigned tickets. Scanning for available agents...`);

            let assignedCount = 0;

            for (const ticket of unassigned) {
                // 2. Try to find a suitable agent (Online + Shift-active + Least Load)
                const assigneeId = await getShiftAssignee(ticket.queue_id, ticket.priority);

                if (assigneeId) {
                    // 3. Perform the assignment (Atomic Claim)
                    // We only update if assigned_to is still NULL to prevent races
                    const [result] = await conn.query(
                        `UPDATE tickets 
                         SET assigned_to = ?, 
                             status = CASE WHEN status = 'pending' THEN 'open' ELSE status END,
                             updated_at = NOW() 
                         WHERE id = ? AND assigned_to IS NULL`,
                        [assigneeId, ticket.id]
                    );

                    if (result.affectedRows > 0) {
                        // 4. Real-time Notifications (Only if we successfully claimed the ticket)
                        broadcastEvent("monitoring_headquarters", "TICKET_AUTO_ASSIGNED", {
                            ticketId: ticket.id,
                            ticketNumber: ticket.ticket_number,
                            assignedTo: assigneeId
                        });

                        broadcastEvent(`user_${assigneeId}`, "NEW_TICKET_ASSIGNED", {
                            ticketId: ticket.id,
                            ticketNumber: ticket.ticket_number,
                            subject: ticket.subject
                        });

                        logger.info(`[AssignmentSweeper] Successfully assigned ${ticket.ticket_number} to User ${assigneeId}`);
                        assignedCount++;
                    } else {
                        logger.warn(`[AssignmentSweeper] Race condition detected: Ticket ${ticket.ticket_number} was already assigned elsewhere.`);
                    }
                }
            }

            if (assignedCount > 0) {
                logger.info(`[AssignmentSweeper] Sweep complete. Assigned ${assignedCount} tickets.`);
            }

        } catch (err) {
            logger.error(`[AssignmentSweeper] Critical Error: ${err.message}`);
        } finally {
            if (conn) conn.release();
        }
    }, INTERVAL_MS);

    logger.info(`[AssignmentSweeper] Background worker initialized. Scanning for unassigned items every 2m.`);
};
