// modules/auth/authController.js
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import connectDB from "../../db/index.js";
import dotenv from "dotenv";
import { logger } from "../../logger.js";
dotenv.config();

// POST /api/auth/login
export const login = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ success: false, message: "Email and password are required." });

    try {
        const pool = connectDB();
        const [users] = await pool.query(
            `SELECT id, name, email, password_hash, role, reporting_to, is_active FROM users WHERE email = ? LIMIT 1`,
            [email]
        );

        if (!users.length) return res.status(401).json({ success: false, message: "Invalid credentials." });

        const user = users[0];
        if (!user.is_active) return res.status(403).json({ success: false, message: "Account deactivated." });

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ success: false, message: "Invalid credentials." });

        const token = jwt.sign(
            { userId: user.id, name: user.name, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
        );

        return res.json({
            success: true,
            token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/auth/me
export const getMe = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT id, name, email, role, reporting_to, is_active, created_at FROM users WHERE id = ?`,
            [req.user.userId]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: "User not found." });
        return res.json({ success: true, user: rows[0] });
    } catch (err) {
        console.error("GetMe error:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/auth/reset-password
export const verifyAndResetPassword = async (req, res) => {
    const { userId, token, newPassword } = req.body;

    if (!userId || !token || !newPassword) {
        return res.status(400).json({ success: false, message: "User ID, token, and new password are required." });
    }

    try {
        logger.info(`Attempting password reset for userId: ${userId}`);
        
        // 1. Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
            logger.info(`Token decoded successfully for userId: ${decoded.userId}`);
        } catch (err) {
            logger.error(`JWT Verification failed: ${err.message}`);
            return res.status(401).json({ success: false, message: "Invalid or expired reset token." });
        }

        // 2. Ensure token belongs to this user and is for password reset
        if (decoded.userId != userId || decoded.purpose !== 'password_reset') {
            logger.error(`Token payload mismatch. Decoded ID: ${decoded.userId}, Body ID: ${userId}, Purpose: ${decoded.purpose}`);
            return res.status(401).json({ success: false, message: "Invalid token payload." });
        }

        const pool = connectDB();
        
        // 3. Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        // 4. Update user
        const [result] = await pool.query(
            `UPDATE users SET password_hash = ? WHERE id = ?`,
            [hashedPassword, userId]
        );

        if (result.affectedRows === 0) {
            logger.error(`User not found in DB for reset: userId ${userId}`);
            return res.status(404).json({ success: false, message: "User not found." });
        }

        logger.info(`Password reset successful for userId: ${userId}`);
        return res.json({ success: true, message: "Password has been reset successfully. You can now log in." });
    } catch (err) {
        logger.error(`ResetPassword error: ${err.message}`);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
