// modules/queues/queueController.js
import connectDB from "../../db/index.js";

// GET /api/queues
export const getQueues = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT q.*, u.name as created_by_name,
              m.response_multiplier, m.escalation_multiplier, m.stricter_only,
              COUNT(DISTINCT qa.user_id) as agent_count,
              COUNT(DISTINCT t.id) as ticket_count
             FROM queues q
             LEFT JOIN users u ON q.created_by = u.id
             LEFT JOIN queue_agents qa ON qa.queue_id = q.id
             LEFT JOIN tickets t ON t.queue_id = q.id AND t.status NOT IN ('resolved','closed')
             LEFT JOIN queue_sla_modifiers m ON m.queue_id = q.id
             GROUP BY q.id
             ORDER BY q.priority ASC, q.created_at DESC`
        );
        return res.json({ success: true, queues: rows });
    } catch (err) {
        console.error("getQueues:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/queues/:id
export const getQueueById = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(`SELECT * FROM queues WHERE id=?`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: "Queue not found." });

        const [modifier] = await pool.query(`SELECT * FROM queue_sla_modifiers WHERE queue_id=?`, [req.params.id]);
        const [agents] = await pool.query(
            `SELECT u.id, u.name, u.email, qa.role as queue_role 
             FROM queue_agents qa 
             JOIN users u ON qa.user_id = u.id 
             WHERE qa.queue_id=?`, 
            [req.params.id]
        );

        return res.json({ 
            success: true, 
            queue: { ...rows[0], modifier: modifier[0] || null }, 
            agents 
        });
    } catch (err) {
        console.error("getQueueById:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/queues
export const createQueue = async (req, res) => {
    const { name, priority, sla_hours, description, type, modifier } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "Queue name is required." });
    try {
        const pool = connectDB();
        const [result] = await pool.query(
            `INSERT INTO queues (name, priority, sla_hours, description, created_by, type) VALUES (?,?,?,?,?,?)`,
            [name, priority || 3, sla_hours || 24.00, description || null, req.user.userId, type || 'pull']
        );
        const queueId = result.insertId;

        if (modifier) {
            await pool.query(
                `INSERT INTO queue_sla_modifiers (queue_id, response_multiplier, escalation_multiplier, stricter_only) VALUES (?,?,?,?)`,
                [queueId, modifier.response_multiplier || 1.0, modifier.escalation_multiplier || 1.0, modifier.stricter_only ? 1 : 0]
            );
        }

        return res.status(201).json({ success: true, message: "Queue created.", queueId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: "Queue name already exists." });
        console.error("createQueue:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PUT /api/queues/:id
export const updateQueue = async (req, res) => {
    const { name, priority, sla_hours, description, type, modifier } = req.body;
    try {
        const pool = connectDB();
        const updates = [], vals = [];
        if (name) { updates.push("name=?"); vals.push(name); }
        if (priority !== undefined) { updates.push("priority=?"); vals.push(priority); }
        if (sla_hours !== undefined) { updates.push("sla_hours=?"); vals.push(sla_hours); }
        if (description !== undefined) { updates.push("description=?"); vals.push(description); }
        if (type !== undefined) { updates.push("type=?"); vals.push(type); }
        
        if (updates.length > 0) {
            vals.push(req.params.id);
            await pool.query(`UPDATE queues SET ${updates.join(",")} WHERE id=?`, vals);
        }

        if (modifier) {
            await pool.query(
                `INSERT INTO queue_sla_modifiers (queue_id, response_multiplier, escalation_multiplier, stricter_only) 
                 VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE 
                 response_multiplier=VALUES(response_multiplier), escalation_multiplier=VALUES(escalation_multiplier), stricter_only=VALUES(stricter_only)`,
                [req.params.id, modifier.response_multiplier, modifier.escalation_multiplier, modifier.stricter_only ? 1 : 0]
            );
        }

        return res.json({ success: true, message: "Queue updated." });
    } catch (err) {
        console.error("updateQueue:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// DELETE /api/queues/:id
export const deleteQueue = async (req, res) => {
    try {
        const pool = connectDB();
        // Explicit cleanup to avoid FK issues even with CASCADE
        await pool.query(`DELETE FROM queue_sla_modifiers WHERE queue_id=?`, [req.params.id]);
        await pool.query(`DELETE FROM queue_agents WHERE queue_id=?`, [req.params.id]);
        await pool.query(`UPDATE tickets SET queue_id=NULL WHERE queue_id=?`, [req.params.id]);
        await pool.query(`UPDATE customer_domains SET queue_id=NULL WHERE queue_id=?`, [req.params.id]);
        
        const [result] = await pool.query(`DELETE FROM queues WHERE id=?`, [req.params.id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Queue not found." });
        }
        
        return res.json({ success: true, message: "Queue deleted successfully." });
    } catch (err) {
        console.error("deleteQueue:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/queues/:id/agents  – assign agents/supervisors
export const assignAgents = async (req, res) => {
    const { agents } = req.body; // [{ user_id, role }]
    if (!Array.isArray(agents)) return res.status(400).json({ success: false, message: "agents array is required." });
    try {
        const pool = connectDB();
        // Delete existing and re-insert (full replace)
        await pool.query(`DELETE FROM queue_agents WHERE queue_id=?`, [req.params.id]);
        if (agents.length) {
            const vals = agents.map(a => [req.params.id, a.user_id, a.role || "agent"]);
            await pool.query(`INSERT INTO queue_agents (queue_id, user_id, role) VALUES ?`, [vals]);
        }
        return res.json({ success: true, message: "Queue agents updated." });
    } catch (err) {
        console.error("assignAgents:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
