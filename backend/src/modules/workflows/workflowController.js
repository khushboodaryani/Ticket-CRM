// src/modules/workflows/workflowController.js
import connectDB from "../../db/index.js";

// GET /api/workflows/rules
export const getRules = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query("SELECT * FROM workflow_rules ORDER BY created_at DESC");
        return res.json({ success: true, rules: rows });
    } catch (err) {
        console.error("getRules:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/workflows/rules
export const createRule = async (req, res) => {
    const { name, description, trigger_event, conditions, actions } = req.body;
    if (!name || !trigger_event || !actions) {
        return res.status(400).json({ success: false, message: "name, trigger_event, and actions are required." });
    }

    try {
        const pool = connectDB();
        const finalConditions = typeof conditions === 'string' ? conditions : JSON.stringify(conditions || {});
        const finalActions = typeof actions === 'string' ? actions : JSON.stringify(actions);

        const [result] = await pool.query(
            "INSERT INTO workflow_rules (name, trigger_event, conditions, actions, created_by) VALUES (?,?,?,?,?)",
            [name, trigger_event, finalConditions, finalActions, req.user.userId]
        );
        return res.status(201).json({ success: true, message: "Workflow rule created.", ruleId: result.insertId });
    } catch (err) {
        console.error("createRule:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PUT /api/workflows/rules/:id
export const updateRule = async (req, res) => {
    const { name, description, trigger_event, conditions, actions, is_active } = req.body;
    try {
        const pool = connectDB();
        const updates = [];
        const vals = [];

        if (name) { updates.push("name=?"); vals.push(name); }
        if (description !== undefined) { updates.push("description=?"); vals.push(description); }
        if (trigger_event) { updates.push("trigger_event=?"); vals.push(trigger_event); }
        if (conditions) { 
            updates.push("conditions=?"); 
            vals.push(typeof conditions === 'string' ? conditions : JSON.stringify(conditions)); 
        }
        if (actions) { 
            updates.push("actions=?"); 
            vals.push(typeof actions === 'string' ? actions : JSON.stringify(actions)); 
        }
        if (is_active !== undefined) { updates.push("is_active=?"); vals.push(is_active ? 1 : 0); }

        if (!updates.length) return res.status(400).json({ success: false, message: "Nothing to update." });

        vals.push(req.params.id);
        await pool.query(`UPDATE workflow_rules SET ${updates.join(",")} WHERE id=?`, vals);
        return res.json({ success: true, message: "Workflow rule updated." });
    } catch (err) {
        console.error("updateRule:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// DELETE /api/workflows/rules/:id
export const deleteRule = async (req, res) => {
    try {
        const pool = connectDB();
        await pool.query("DELETE FROM workflow_rules WHERE id=?", [req.params.id]);
        return res.json({ success: true, message: "Workflow rule deleted." });
    } catch (err) {
        console.error("deleteRule:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PATCH /api/workflows/rules/:id/toggle
export const toggleRule = async (req, res) => {
    try {
        const pool = connectDB();
        await pool.query("UPDATE workflow_rules SET is_active = NOT is_active WHERE id = ?", [req.params.id]);
        return res.json({ success: true, message: "Workflow status toggled." });
    } catch (err) {
        console.error("toggleRule:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/workflows/runs/:ticketId
export const getRunsForTicket = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            "SELECT wr.*, r.name as rule_name FROM workflow_runs wr JOIN workflow_rules r ON wr.rule_id = r.id WHERE wr.ticket_id = ? ORDER BY wr.executed_at DESC",
            [req.params.ticketId]
        );
        return res.json({ success: true, runs: rows });
    } catch (err) {
        console.error("getRunsForTicket:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
