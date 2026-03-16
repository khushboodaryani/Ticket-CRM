// src/modules/sla/slaController.js
import connectDB from "../../db/index.js";

// GET /api/sla
export const getSLAPolicies = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT * FROM sla_policies ORDER BY priority ASC`
        );
        return res.json({ success: true, policies: rows });
    } catch (err) {
        console.error("getSLAPolicies:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PUT /api/sla/:id
export const updateSLAPolicy = async (req, res) => {
    const { resolution_time_hours, escalation_1_min, escalation_2_min, escalation_3_min } = req.body;
    const { id } = req.params;

    if (resolution_time_hours === undefined || escalation_1_min === undefined || escalation_2_min === undefined || escalation_3_min === undefined) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }

    try {
        const pool = connectDB();
        const [existing] = await pool.query(`SELECT id FROM sla_policies WHERE id=?`, [id]);
        if (!existing.length) {
            return res.status(404).json({ success: false, message: "SLA Policy not found." });
        }

        await pool.query(
            `UPDATE sla_policies SET resolution_time_hours=?, escalation_1_min=?, escalation_2_min=?, escalation_3_min=? WHERE id=?`,
            [resolution_time_hours, escalation_1_min, escalation_2_min, escalation_3_min, id]
        );

        return res.json({ success: true, message: "SLA Policy updated successfully." });
    } catch (err) {
        console.error("updateSLAPolicy:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
