// src/modules/sla/slaController.js
import connectDB from "../../db/index.js";
import { getEffectiveSLAPolicies, getConfiguredPriorities } from "./slaPolicyService.js";

// GET /api/sla/customer/:customerId — returns policies for a specific customer, including overrides
export const getCustomerSLAPolicies = async (req, res) => {
    const { customerId } = req.params;
    try {
        const pool = connectDB();
        
        // 1. Get all active priorities
        const [priorities] = await pool.query(`
            SELECT p.id as priority_id, p.name as priority_name, c.name as category_name, c.prefix, p.level
            FROM priorities p
            JOIN sla_priority_categories c ON p.category_id = c.id
            WHERE p.is_active = 1
            ORDER BY c.sort_order ASC, p.level ASC
        `);

        // 2. Get existing overrides for this customer
        const [overrides] = customerId && customerId !== '0'
            ? await pool.query(`SELECT * FROM sla_policies_new WHERE customer_id = ? AND is_active = 1`, [customerId])
            : [[], []];

        // 3. Merge: Default to global if no override exists (though UI will handle the logic, we provide both)
        const [globals] = await pool.query(
            `SELECT * FROM sla_policies_new WHERE customer_id IS NULL AND project_id IS NULL AND is_active = 1`
        );

        const result = priorities.map(p => {
            const override = overrides.find(o => o.priority_id === p.priority_id);
            const fallback = globals.find(g => g.priority_id === p.priority_id);
            return {
                ...p,
                override_id: override?.id || null,
                resolution_time_hours: override?.resolution_hrs || fallback?.resolution_hrs || 4,
                first_response_hrs: override?.first_response_hrs || fallback?.first_response_hrs || 1.0,
                is_overridden: !!override
            };
        });

        return res.json({ success: true, policies: result });
    } catch (err) {
        console.error("getCustomerSLAPolicies:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/sla/priorities — returns list of configured priority labels
export const getConfiguredPriorityList = async (req, res) => {
    try {
        const pool = connectDB();
        const priorities = await getConfiguredPriorities(pool);
        return res.json({ success: true, priorities });
    } catch (err) {
        console.error("getConfiguredPriorityList:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/sla/categories — returns system-defined categories
export const getPriorityCategories = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(`SELECT * FROM sla_priority_categories WHERE is_active = 1 ORDER BY sort_order ASC`);
        return res.json({ success: true, categories: rows });
    } catch (err) {
        console.error("getPriorityCategories:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PUT /api/sla/:id
export const updateSLAPolicy = async (req, res) => {
    const { resolution_time_hours, response_time_sec, first_response_hrs } = req.body;
    const { id } = req.params;

    try {
        const pool = connectDB();
        const [existing] = await pool.query(`SELECT id FROM sla_policies_new WHERE id=?`, [id]);
        if (!existing.length) {
            return res.status(404).json({ success: false, message: "SLA Policy not found." });
        }

        // We use first_response_hrs if provided, or fallback to response_time_sec/3600
        const resolvedFirstResponse = first_response_hrs !== undefined 
            ? first_response_hrs 
            : (response_time_sec ? response_time_sec / 3600 : 1.0);

        await pool.query(
            `UPDATE sla_policies_new
             SET resolution_hrs=?, first_response_hrs=?
             WHERE id=?`,
            [resolution_time_hours, resolvedFirstResponse, id]
        );

        return res.json({ success: true, message: "SLA Policy updated successfully." });
    } catch (err) {
        console.error("updateSLAPolicy:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/sla — Create a new priority tier dynamically
export const createSLAPolicy = async (req, res) => {
    const { priority, resolution_time_hours, first_response_hrs, category_id, level } = req.body;

    if (!priority || !category_id) {
        return res.status(400).json({ success: false, message: "Priority name and Category are required." });
    }

    try {
        const pool = connectDB();

        // 1. Calculate next level if not provided
        let targetLevel = parseInt(level, 10);
        if (!targetLevel) {
            const [maxRows] = await pool.query(`SELECT MAX(level) as maxLevel FROM priorities WHERE category_id = ?`, [category_id]);
            targetLevel = (maxRows[0].maxLevel || 0) + 1;
        }

        // 2. Create priority record
        const [prioResult] = await pool.query(
            `INSERT INTO priorities (name, category_id, \`level\`) VALUES (?, ?, ?)`,
            [priority, category_id, targetLevel]
        );
        const priorityId = prioResult.insertId;

        // 2. Initialize sequence (if not present for this category)
        await pool.query(
            `INSERT IGNORE INTO priority_sequences (category_id, last_seq) VALUES (?, 0)`,
            [category_id]
        );

        // 3. Create global SLA policy
        const [slaResult] = await pool.query(
            `INSERT INTO sla_policies_new (name, priority_id, first_response_hrs, resolution_hrs)
             VALUES (?, ?, ?, ?)`,
            [`Global Default - ${priority}`, priorityId, first_response_hrs || 1.0, resolution_time_hours || 4.0]
        );

        return res.status(201).json({ success: true, message: `Priority ${priority} created.`, id: slaResult.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                success: false, 
                message: "Priority name or Level within this category already exists." 
            });
        }
        console.error("createSLAPolicy:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// DELETE /api/sla/:id — Remove a priority (soft delete via active flag)
export const deleteSLAPolicy = async (req, res) => {
    const { id } = req.params;
    try {
        const pool = connectDB();
        // 1. Find the priority_id from this policy
        const [policyRows] = await pool.query(`SELECT priority_id FROM sla_policies_new WHERE id = ?`, [id]);
        if (policyRows.length) {
            const pid = policyRows[0].priority_id;
            // 2. Deactivate the priority tier
            await pool.query(`UPDATE priorities SET is_active = 0 WHERE id = ?`, [pid]);
        }
        // 3. Deactivate the global policy
        await pool.query(`UPDATE sla_policies_new SET is_active = 0 WHERE id = ?`, [id]);
        
        return res.json({ success: true, message: `Priority tier deactivated.` });
    } catch (err) {
        console.error("deleteSLAPolicy:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/sla
export const getSLAPolicies = async (req, res) => {
    try {
        const pool = connectDB();
        const rows = await getEffectiveSLAPolicies(pool);
        return res.json({ success: true, policies: rows });
    } catch (err) {
        console.error("getSLAPolicies:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/sla/customer/:customerId — Save or update a customer override
export const updateCustomerSLAPolicy = async (req, res) => {
    const { customerId } = req.params;
    const { priority_id, resolution_time_hours, first_response_hrs } = req.body;

    if (!priority_id) return res.status(400).json({ success: false, message: "Priority ID is required." });

    try {
        const pool = connectDB();
        
        // Use UPSERT logic: check if exists, then update or insert
        const [existing] = await pool.query(
            `SELECT id FROM sla_policies_new WHERE customer_id = ? AND priority_id = ?`,
            [customerId, priority_id]
        );

        if (existing.length) {
            await pool.query(
                `UPDATE sla_policies_new SET resolution_hrs = ?, first_response_hrs = ? WHERE id = ?`,
                [resolution_time_hours, first_response_hrs, existing[0].id]
            );
        } else {
            await pool.query(
                `INSERT INTO sla_policies_new (name, customer_id, priority_id, resolution_hrs, first_response_hrs)
                 VALUES (?, ?, ?, ?, ?)`,
                [`Override - Customer ${customerId} - Prio ${priority_id}`, customerId, priority_id, resolution_time_hours, first_response_hrs]
            );
        }

        return res.json({ success: true, message: "Customer SLA override saved." });
    } catch (err) {
        console.error("updateCustomerSLAPolicy:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
