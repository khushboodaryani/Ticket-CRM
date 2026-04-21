import connectDB from "../../db/index.js";
import { emitToUser } from "../../services/socketService.js";
import {
    buildTemplatePreviewVariables,
    ensureNotificationTemplates,
    fetchNotificationTemplates,
    getNotificationTemplate,
    renderTemplateString,
    TEMPLATE_VARIABLES,
} from "./templateService.js";

/**
 * Utility: Create an in-app notification for a user
 * Can be called from any other module
 */
export const createNotification = async (pool, { user_id, type, title, body, entity_id }) => {
    try {
        const [result] = await pool.query(
            `INSERT INTO in_app_notifications (user_id, type, title, body, entity_id) VALUES (?,?,?,?,?)`,
            [user_id, type, title, body || null, entity_id || null]
        );

        // Emit real-time socket event
        emitToUser(user_id, "new_notification", {
            id: result.insertId,
            user_id,
            type,
            title,
            body,
            entity_id,
            is_read: 0,
            created_at: new Date()
        });
    } catch (err) {
        console.error("createNotification error:", err.message);
    }
};

// GET /api/notifications   (current user's notifications)
export const getMyNotifications = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT * FROM in_app_notifications
             WHERE user_id = ?
             ORDER BY is_read ASC, created_at DESC
             LIMIT 50`,
            [req.user.userId]
        );
        const unreadCount = rows.filter(r => !r.is_read).length;
        return res.json({ success: true, notifications: rows, unread_count: unreadCount });
    } catch (err) {
        console.error("getMyNotifications:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PUT /api/notifications/:id/read
export const markRead = async (req, res) => {
    try {
        const pool = connectDB();
        await pool.query(
            `UPDATE in_app_notifications SET is_read=1 WHERE id=? AND user_id=?`,
            [req.params.id, req.user.userId]
        );
        return res.json({ success: true, message: "Notification marked as read." });
    } catch (err) {
        console.error("markRead:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PUT /api/notifications/read-all
export const markAllRead = async (req, res) => {
    try {
        const pool = connectDB();
        await pool.query(
            `UPDATE in_app_notifications SET is_read=1 WHERE user_id=?`,
            [req.user.userId]
        );
        return res.json({ success: true, message: "All notifications marked as read." });
    } catch (err) {
        console.error("markAllRead:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

export const getNotificationTemplates = async (req, res) => {
    try {
        const pool = connectDB();
        const templates = await fetchNotificationTemplates(pool);
        return res.json({
            success: true,
            templates,
            variables: TEMPLATE_VARIABLES,
        });
    } catch (err) {
        console.error("getNotificationTemplates:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

export const updateNotificationTemplate = async (req, res) => {
    const { templateKey } = req.params;
    const { subject_template, heading, body_text, footer_text, body_html, is_active } = req.body;

    if (!subject_template) {
        return res.status(400).json({ success: false, message: "subject_template is required." });
    }

    try {
        const pool = connectDB();
        await ensureNotificationTemplates(pool);
        const existing = await getNotificationTemplate(pool, templateKey);
        if (!existing) {
            return res.status(404).json({ success: false, message: "Template not found." });
        }

        await pool.query(
            `INSERT INTO notification_templates (template_key, name, description, subject_template, heading, body_text, footer_text, body_html, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               name = VALUES(name),
               description = VALUES(description),
               subject_template = VALUES(subject_template),
               heading = VALUES(heading),
               body_text = VALUES(body_text),
               footer_text = VALUES(footer_text),
               body_html = VALUES(body_html),
               is_active = VALUES(is_active)`,
            [
                templateKey,
                existing.name,
                existing.description,
                subject_template,
                heading || null,
                body_text || null,
                footer_text || null,
                body_html || existing.body_html,
                is_active === undefined ? 1 : (is_active ? 1 : 0),
            ]
        );

        return res.json({ success: true, message: "Template updated successfully." });
    } catch (err) {
        console.error("updateNotificationTemplate:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

export const resetNotificationTemplate = async (req, res) => {
    const { templateKey } = req.params;
    try {
        const pool = connectDB();
        await ensureNotificationTemplates(pool);
        await pool.query(`DELETE FROM notification_templates WHERE template_key = ?`, [templateKey]);
        return res.json({ success: true, message: "Template reset to default." });
    } catch (err) {
        console.error("resetNotificationTemplate:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

export const previewNotificationTemplate = async (req, res) => {
    const { templateKey } = req.params;
    const { subject_template, heading, body_text, footer_text, body_html } = req.body;

    if (!subject_template) {
        return res.status(400).json({ success: false, message: "subject_template is required." });
    }

    try {
        const pool = connectDB();
        const variables = buildTemplatePreviewVariables(templateKey);
        
        // Use provided HTML or build from blocks
        let sourceHtml = body_html;
        if (heading && body_text) {
            // We use the same buildEmailLayout logic or a mock version for preview
            // Actually, we can just call renderNotificationTemplate with mock data if we had a way to pass draft data
            // For now, let's just use renderTemplateString on the provided content
            // The templateService.js now has buildEmailLayout exported? No, but renderNotificationTemplate uses it.
            // Let's just manually render for preview here if blocks are present.
            const { html } = await (async () => {
                // Temporary mock object to simulate the template record
                const mockSource = { subject_template, heading, body_text, footer_text, body_html };
                const accentColor = templateKey === 'sla_breach' ? '#dc2626' : '#4f8ef7';
                // Simplified layout for preview
                const html = `<div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 680px; margin: 0 auto;">
                    <h2 style="color: ${accentColor}; margin-bottom: 4px;">${heading}</h2>
                    <p style="color: #64748b; margin-top: 0;">${body_text}</p>
                    <div style="padding: 15px; border: 1px dashed #ccc; margin: 20px 0; color: #999; font-size: 12px; text-align: center;">
                        [ Structural Ticket Data Table Here ]
                    </div>
                    <p style="font-size: 12px; color: #999;">Regards,<br/><strong>${footer_text || 'Team'}</strong></p>
                </div>`;
                return { html };
            })();
            sourceHtml = html;
        }

        return res.json({
            success: true,
            preview: {
                subject: renderTemplateString(subject_template, variables),
                html: renderTemplateString(sourceHtml || body_html, variables),
            },
            variables,
        });
    } catch (err) {
        console.error("previewNotificationTemplate:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
