// modules/notifications/notificationController.js
import connectDB from "../../db/index.js";

/**
 * Utility: Create an in-app notification for a user
 * Can be called from any other module
 */
export const createNotification = async (pool, { user_id, type, title, body, entity_id }) => {
    try {
        await pool.query(
            `INSERT INTO in_app_notifications (user_id, type, title, body, entity_id) VALUES (?,?,?,?,?)`,
            [user_id, type, title, body || null, entity_id || null]
        );
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
