// src/controllers/shiftController.js
import connectDB from "../db/index.js";

// GET /api/shifts
export const getShifts = async (req, res) => {
    try {
        const pool = connectDB();
        const [shifts] = await pool.query(
            `SELECT s.*, u.name as created_by_name,
              COUNT(sm.id) as member_count
       FROM shifts s
       LEFT JOIN users u ON s.created_by = u.id
       LEFT JOIN shift_members sm ON sm.shift_id = s.id
       GROUP BY s.id ORDER BY s.created_at DESC`
        );
        return res.json({ success: true, shifts });
    } catch (err) {
        console.error("getShifts:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/shifts/:id
export const getShiftById = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(`SELECT * FROM shifts WHERE id=?`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: "Shift not found." });

        const [members] = await pool.query(
            `SELECT sm.*, u.name, u.role FROM shift_members sm
       JOIN users u ON sm.user_id = u.id WHERE sm.shift_id=?`,
            [req.params.id]
        );
        return res.json({ success: true, shift: rows[0], members });
    } catch (err) {
        console.error("getShiftById:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/shifts
export const createShift = async (req, res) => {
    const { name, start_time, end_time, shift_type, working_days, members } = req.body;
    if (!name || !start_time || !end_time)
        return res.status(400).json({ success: false, message: "name, start_time, end_time are required." });

    try {
        const pool = connectDB();
        const workDaysJSON = JSON.stringify(working_days || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
        const [result] = await pool.query(
            `INSERT INTO shifts (name, start_time, end_time, shift_type, working_days, created_by)
       VALUES (?,?,?,?,?,?)`,
            [name, start_time, end_time, shift_type || "general", workDaysJSON, req.user.userId]
        );
        const shiftId = result.insertId;

        // Add members
        if (members && members.length) {
            const memberVals = members.map((m) => [shiftId, m.user_id, m.role || "agent"]);
            await pool.query(`INSERT INTO shift_members (shift_id, user_id, role) VALUES ?`, [memberVals]);
        }

        return res.status(201).json({ success: true, message: "Shift created.", shiftId });
    } catch (err) {
        console.error("createShift:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PUT /api/shifts/:id
export const updateShift = async (req, res) => {
    const { name, start_time, end_time, shift_type, working_days } = req.body;
    try {
        const pool = connectDB();
        const updates = [];
        const vals = [];
        if (name) { updates.push("name=?"); vals.push(name); }
        if (start_time) { updates.push("start_time=?"); vals.push(start_time); }
        if (end_time) { updates.push("end_time=?"); vals.push(end_time); }
        if (shift_type) { updates.push("shift_type=?"); vals.push(shift_type); }
        if (working_days) { updates.push("working_days=?"); vals.push(JSON.stringify(working_days)); }

        if (!updates.length) return res.status(400).json({ success: false, message: "Nothing to update." });
        vals.push(req.params.id);
        await pool.query(`UPDATE shifts SET ${updates.join(",")} WHERE id=?`, vals);
        return res.json({ success: true, message: "Shift updated." });
    } catch (err) {
        console.error("updateShift:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/shifts/:id/members  – add/remove members
export const updateShiftMembers = async (req, res) => {
    const { members } = req.body; // [{user_id, role}]
    try {
        const pool = connectDB();
        await pool.query(`DELETE FROM shift_members WHERE shift_id=?`, [req.params.id]);
        if (members && members.length) {
            const vals = members.map((m) => [req.params.id, m.user_id, m.role || "agent"]);
            await pool.query(`INSERT INTO shift_members (shift_id, user_id, role) VALUES ?`, [vals]);
        }
        return res.json({ success: true, message: "Shift members updated." });
    } catch (err) {
        console.error("updateShiftMembers:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
