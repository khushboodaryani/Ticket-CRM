// modules/users/presenceController.js
import connectDB from "../../db/index.js";
import { notifyAgentStatusChange } from "../../services/socketBroadcaster.js";

/**
 * POST /api/users/presence
 * Allows users to manually toggle their online/offline status.
 */
export const updatePresence = async (req, res) => {
    const { is_online, status } = req.body;
    const userId = req.user.userId;

    try {
        const pool = connectDB();
        
        // Update the user's status manually
        // We set status_source = 'manual' to prevent the automated worker from killing the session too early
        // We also update last_heartbeat to 'now' to keep it fresh
        await pool.query(
            `UPDATE users 
             SET is_online = ?, 
                 status = ?, 
                 status_source = 'manual', 
                 last_heartbeat = NOW() 
             WHERE id = ?`,
            [is_online ? 1 : 0, status || (is_online ? 'available' : 'offline'), userId]
        );

        notifyAgentStatusChange(userId, status || (is_online ? 'available' : 'offline'), 'manual');

        return res.json({ 
            success: true, 
            message: `Presence updated to ${is_online ? 'online' : 'offline'}.`,
            is_online: !!is_online 
        });
    } catch (err) {
        console.error("updatePresence:", err);
        return res.status(500).json({ success: false, message: "Failed to update presence." });
    }
};

/**
 * GET /api/users/presence
 * Retrieves the current user's online status and source.
 */
export const getMyPresence = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            "SELECT is_online, status, status_source FROM users WHERE id = ?",
            [req.user.userId]
        );
        
        if (!rows.length) return res.status(404).json({ success: false, message: "User not found." });
        
        return res.json({ success: true, presence: rows[0] });
    } catch (err) {
        console.error("getMyPresence:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
