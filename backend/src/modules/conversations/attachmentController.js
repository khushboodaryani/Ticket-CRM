// backend/src/modules/conversations/attachmentController.js
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import connectDB from "../../db/index.js";
import { logger } from "../../logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_BASE = path.resolve(__dirname, "../../../public/attachments");

/**
 * GET /api/tickets/attachments/:id
 * Securely serves a conversation attachment with RBAC and path traversal protection.
 */
export const downloadAttachment = async (req, res) => {
    const { id } = req.params;
    const { userId, role, customer_id: user_customer_id } = req.user;

    try {
        const pool = connectDB();

        // 1. Fetch attachment metadata and linked ticket info
        const [attachments] = await pool.query(
            `SELECT a.*, t.id as ticket_id, t.assigned_to, t.queue_id, t.customer_id as ticket_customer_id, t.status as ticket_status
             FROM conversation_message_attachments a
             JOIN conversation_messages m ON a.message_id = m.id
             JOIN conversations c ON m.conversation_id = c.id
             JOIN tickets t ON c.ticket_id = t.id
             WHERE a.id = ? AND a.is_deleted = 0`,
            [id]
        );

        if (!attachments.length) {
            return res.status(404).json({ success: false, message: "Attachment not found." });
        }

        const att = attachments[0];

        // 2. RBAC Access Control
        let hasAccess = false;

        if (['superadmin', 'gm', 'manager'].includes(role)) {
            hasAccess = true;
        } else if (role === 'agent' || role === 'tl') {
            // Check if assigned or in queue
            if (att.assigned_to === userId) {
                hasAccess = true;
            } else if (att.queue_id) {
                // Check if agent belongs to this queue
                const [qCheck] = await pool.query(
                    `SELECT 1 FROM queue_agents WHERE queue_id = ? AND user_id = ?`,
                    [att.queue_id, userId]
                );
                if (qCheck.length > 0) hasAccess = true;
            }
            
            // If it's internal and visibility is private/internal, agent still needs ticket access
            // But if it's 'public', they certainly can see it if they see the ticket.
        } else if (user_customer_id) {
            // Customer access check
            if (att.ticket_customer_id === user_customer_id && att.visibility === 'public') {
                hasAccess = true;
            }
        }

        if (!hasAccess) {
            logger.warn(`Unauthorized access attempt to attachment ${id} by user ${userId}`);
            return res.status(403).json({ success: false, message: "Access denied." });
        }

        // 3. Prevent Path Traversal
        const safePath = path.resolve(STORAGE_BASE, path.basename(att.storage_path));
        
        // Final sanity check: ensuring the resolved path is inside STORAGE_BASE
        if (!safePath.startsWith(STORAGE_BASE)) {
            logger.error(`Path traversal attempt detected: ${att.storage_path}`);
            return res.status(400).json({ success: false, message: "Invalid file path." });
        }

        if (!fs.existsSync(safePath)) {
            logger.error(`File missing on disk: ${safePath}`);
            return res.status(404).json({ success: false, message: "File not found on storage." });
        }

        // 4. Serve File with original name
        res.setHeader("Content-Type", att.file_type || "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${att.original_name}"`);
        
        const fileStream = fs.createReadStream(safePath);
        fileStream.pipe(res);

    } catch (err) {
        logger.error(`downloadAttachment error: ${err.message}`);
        return res.status(500).json({ success: false, message: "Server error during download." });
    }
};

/**
 * GET /attachments/:filename
 * Optimized for legacy URL support while enforcing the same security constraints.
 */
export const getAttachmentByFilename = async (req, res) => {
    const { filename } = req.params;
    const { userId, role, customer_id: user_customer_id } = req.user;

    try {
        const pool = connectDB();

        // Find by storage_path (filename)
        const [attachments] = await pool.query(
            `SELECT a.*, t.id as ticket_id, t.assigned_to, t.queue_id, t.customer_id as ticket_customer_id
             FROM conversation_message_attachments a
             JOIN conversation_messages m ON a.message_id = m.id
             JOIN conversations c ON m.conversation_id = c.id
             JOIN tickets t ON c.ticket_id = t.id
             WHERE a.storage_path = ? AND a.is_deleted = 0`,
            [filename]
        );

        if (!attachments.length) {
            // Fallback for files not yet in the new metadata table (but exist on disk)
            // For extreme safety during migration, we might allow admins to see them 
            // if we can't find the record, OR just 404. Let's 404 for security.
            return res.status(404).json({ success: false, message: "Attachment record not found." });
        }

        const att = attachments[0];

        // RBAC Access Control (Same as downloadAttachment)
        let hasAccess = false;
        if (['superadmin', 'gm', 'manager'].includes(role)) {
            hasAccess = true;
        } else if (role === 'agent' || role === 'tl') {
            if (att.assigned_to === userId) {
                hasAccess = true;
            } else if (att.queue_id) {
                const [qCheck] = await pool.query(
                    `SELECT 1 FROM queue_agents WHERE queue_id = ? AND user_id = ?`,
                    [att.queue_id, userId]
                );
                if (qCheck.length > 0) hasAccess = true;
            }
        } else if (user_customer_id) {
            if (att.ticket_customer_id === user_customer_id && att.visibility === 'public') {
                hasAccess = true;
            }
        }

        if (!hasAccess) {
            return res.status(403).json({ success: false, message: "Access denied." });
        }

        const safePath = path.resolve(STORAGE_BASE, path.basename(att.storage_path));
        if (!safePath.startsWith(STORAGE_BASE) || !fs.existsSync(safePath)) {
            return res.status(404).json({ success: false, message: "File not found." });
        }

        res.setHeader("Content-Type", att.file_type || "application/octet-stream");
        res.setHeader("Content-Disposition", `inline; filename="${att.original_name}"`);
        fs.createReadStream(safePath).pipe(res);

    } catch (err) {
        logger.error(`getAttachmentByFilename error: ${err.message}`);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
