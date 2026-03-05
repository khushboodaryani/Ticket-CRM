// src/middlewares/auth.js
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import connectDB from "../db/index.js";
dotenv.config();

/**
 * Verifies JWT token and attaches user to req.user
 */
export const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(403).json({ success: false, message: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded.userId || !decoded.role) {
            return res.status(401).json({ success: false, message: "Invalid token payload." });
        }

        // Pull fresh user from DB so role/status changes are always reflected
        const pool = connectDB();
        const [users] = await pool.query(
            `SELECT id, name, email, role, reporting_to, is_active FROM users WHERE id = ? LIMIT 1`,
            [decoded.userId]
        );

        if (!users.length || !users[0].is_active) {
            return res.status(401).json({ success: false, message: "User not found or deactivated." });
        }

        req.user = {
            userId: users[0].id,
            name: users[0].name,
            email: users[0].email,
            role: users[0].role,
            reporting_to: users[0].reporting_to,
        };

        next();
    } catch (error) {
        console.error("Token verification error:", error.message);
        return res.status(401).json({ success: false, message: "Invalid or expired token." });
    }
};

/**
 * Role guard middleware factory
 * Usage: requireRole("superadmin", "gm")
 */
export const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: "Not authenticated." });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required roles: ${roles.join(", ")}`,
            });
        }
        next();
    };
};
