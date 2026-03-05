// src/controllers/holidayController.js
import connectDB from "../db/index.js";

// GET /api/holidays
export const getHolidays = async (req, res) => {
    try {
        const pool = connectDB();
        const { year } = req.query;
        let where = "1=1";
        const params = [];
        if (year) { where += " AND YEAR(holiday_date)=?"; params.push(year); }
        const [rows] = await pool.query(
            `SELECT h.*, u.name as created_by_name FROM holidays h
       LEFT JOIN users u ON h.created_by = u.id
       WHERE ${where} ORDER BY h.holiday_date ASC`,
            params
        );
        return res.json({ success: true, holidays: rows });
    } catch (err) {
        console.error("getHolidays:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/holidays
export const createHoliday = async (req, res) => {
    const { holiday_date, description } = req.body;
    if (!holiday_date) return res.status(400).json({ success: false, message: "holiday_date is required." });
    try {
        const pool = connectDB();
        const [result] = await pool.query(
            `INSERT INTO holidays (holiday_date, description, created_by) VALUES (?,?,?)`,
            [holiday_date, description || null, req.user.userId]
        );
        return res.status(201).json({ success: true, message: "Holiday added.", holidayId: result.insertId });
    } catch (err) {
        console.error("createHoliday:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/holidays/bulk  – add multiple at once
export const bulkCreateHolidays = async (req, res) => {
    const { holidays } = req.body; // [{holiday_date, description}]
    if (!holidays || !holidays.length)
        return res.status(400).json({ success: false, message: "holidays array is required." });
    try {
        const pool = connectDB();
        const vals = holidays.map((h) => [h.holiday_date, h.description || null, req.user.userId]);
        await pool.query(
            `INSERT IGNORE INTO holidays (holiday_date, description, created_by) VALUES ?`,
            [vals]
        );
        return res.json({ success: true, message: `${vals.length} holiday(s) added.` });
    } catch (err) {
        console.error("bulkCreateHolidays:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// DELETE /api/holidays/:id
export const deleteHoliday = async (req, res) => {
    try {
        const pool = connectDB();
        await pool.query(`DELETE FROM holidays WHERE id=?`, [req.params.id]);
        return res.json({ success: true, message: "Holiday deleted." });
    } catch (err) {
        console.error("deleteHoliday:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
