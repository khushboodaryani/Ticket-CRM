// src/controllers/userController.js
import bcrypt from "bcrypt";
import connectDB from "../db/index.js";

const VALID_ROLES = ["superadmin", "gm", "manager", "tl", "agent"];

// GET /api/users
export const getUsers = async (req, res) => {
    try {
        const pool = connectDB();
        const { role, is_active } = req.query;
        let where = "1=1";
        const params = [];
        if (role) { where += " AND u.role = ?"; params.push(role); }
        if (is_active !== undefined) { where += " AND u.is_active = ?"; params.push(is_active === "true" ? 1 : 0); }

        const [rows] = await pool.query(
            `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at,
              r.id as reporting_to_id, r.name as reporting_to_name
       FROM users u
       LEFT JOIN users r ON u.reporting_to = r.id
       WHERE ${where}
       ORDER BY u.created_at DESC`,
            params
        );
        return res.json({ success: true, users: rows });
    } catch (err) {
        console.error("getUsers:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/users/:id
export const getUserById = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at,
              r.id as reporting_to_id, r.name as reporting_to_name
       FROM users u
       LEFT JOIN users r ON u.reporting_to = r.id
       WHERE u.id = ?`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: "User not found." });
        return res.json({ success: true, user: rows[0] });
    } catch (err) {
        console.error("getUserById:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/users  (superadmin only)
export const createUser = async (req, res) => {
    // Only superadmin can create users
    if (req.user.role !== 'superadmin')
        return res.status(403).json({ success: false, message: 'Only superadmin can create users.' });

    const { name, email, password, role, reporting_to } = req.body;
    if (!name || !email || !password || !role)
        return res.status(400).json({ success: false, message: 'name, email, password, role are required.' });
    if (!VALID_ROLES.includes(role))
        return res.status(400).json({ success: false, message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });

    try {
        const pool = connectDB();
        const [existing] = await pool.query(`SELECT id FROM users WHERE email = ?`, [email]);
        if (existing.length) return res.status(409).json({ success: false, message: 'Email already in use.' });

        const hash = await bcrypt.hash(password, 12);
        const [result] = await pool.query(
            `INSERT INTO users (name, email, password_hash, role, reporting_to, is_active) VALUES (?,?,?,?,?,1)`,
            [name, email, hash, role, reporting_to || null]
        );
        return res.status(201).json({ success: true, message: 'User created.', userId: result.insertId });
    } catch (err) {
        console.error('createUser:', err);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// PUT /api/users/:id
export const updateUser = async (req, res) => {
    const { name, email, role, reporting_to, is_active, password } = req.body;
    try {
        const pool = connectDB();
        const [existing] = await pool.query(`SELECT id FROM users WHERE id = ?`, [req.params.id]);
        if (!existing.length) return res.status(404).json({ success: false, message: 'User not found.' });

        const updates = [];
        const vals = [];
        if (name) { updates.push('name=?'); vals.push(name); }
        if (email) { updates.push('email=?'); vals.push(email); }

        // Only superadmin can change a user's role
        if (role && VALID_ROLES.includes(role)) {
            if (req.user.role !== 'superadmin')
                return res.status(403).json({ success: false, message: 'Only superadmin can change user roles.' });
            updates.push('role=?'); vals.push(role);
        }

        if (reporting_to !== undefined) { updates.push('reporting_to=?'); vals.push(reporting_to || null); }
        if (is_active !== undefined) { updates.push('is_active=?'); vals.push(is_active ? 1 : 0); }
        if (password) { updates.push('password_hash=?'); vals.push(await bcrypt.hash(password, 12)); }

        if (!updates.length) return res.status(400).json({ success: false, message: 'Nothing to update.' });

        vals.push(req.params.id);
        await pool.query(`UPDATE users SET ${updates.join(',')} WHERE id=?`, vals);
        return res.json({ success: true, message: 'User updated.' });
    } catch (err) {
        console.error('updateUser:', err);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// GET /api/users/hierarchy/tree – Returns reporting tree
export const getHierarchy = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT u.id, u.name, u.role, u.reporting_to FROM users u WHERE u.is_active = 1 ORDER BY FIELD(u.role,'superadmin','gm','manager','tl','agent')`
        );
        return res.json({ success: true, users: rows });
    } catch (err) {
        console.error("getHierarchy:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
