// src/modules/sla/slaController.js
import connectDB from "../../db/index.js";
import { getEffectiveSLAPolicies, getConfiguredPriorities, getSlaCalendar } from "./slaPolicyService.js";

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
                escalation_1_min: override?.escalation_1_min ?? fallback?.escalation_1_min ?? null,
                escalation_2_min: override?.escalation_2_min ?? fallback?.escalation_2_min ?? null,
                escalation_3_min: override?.escalation_3_min ?? fallback?.escalation_3_min ?? null,
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
    const { resolution_time_hours, response_time_sec, first_response_hrs, escalation_1_min, escalation_2_min, escalation_3_min } = req.body;
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
             SET resolution_hrs=?, first_response_hrs=?, escalation_1_min=?, escalation_2_min=?, escalation_3_min=?
             WHERE id=?`,
            [resolution_time_hours, resolvedFirstResponse, escalation_1_min || null, escalation_2_min || null, escalation_3_min || null, id]
        );

        return res.json({ success: true, message: "SLA Policy updated successfully." });
    } catch (err) {
        console.error("updateSLAPolicy:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/sla — Create a new priority tier dynamically
export const createSLAPolicy = async (req, res) => {
    const { priority, resolution_time_hours, first_response_hrs, category_id, level, escalation_1_min, escalation_2_min, escalation_3_min } = req.body;

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
            `INSERT INTO sla_policies_new (name, priority_id, first_response_hrs, resolution_hrs, escalation_1_min, escalation_2_min, escalation_3_min)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [`Global Default - ${priority}`, priorityId, first_response_hrs || 1.0, resolution_time_hours || 4.0, escalation_1_min || null, escalation_2_min || null, escalation_3_min || null]
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
    console.log(`[DEBUG] Attempting to delete SLA Policy ID: ${id}`);
    try {
        const pool = connectDB();
        // 1. Find the priority_id from this policy
        const [policyRows] = await pool.query(`SELECT priority_id FROM sla_policies_new WHERE id = ?`, [id]);
        
        if (policyRows.length) {
            const pid = policyRows[0].priority_id;
            console.log(`[DEBUG] Found linked priority_id: ${pid}. Deactivating...`);
            // 2. Deactivate the priority tier
            await pool.query(`UPDATE priorities SET is_active = 0 WHERE id = ?`, [pid]);
        } else {
            console.warn(`[DEBUG] No policy found with ID: ${id}`);
        }

        // 3. Deactivate the global policy record itself
        await pool.query(`UPDATE sla_policies_new SET is_active = 0 WHERE id = ?`, [id]);
        
        console.log(`[DEBUG] Successfully deactivated policy ${id}`);
        return res.json({ success: true, message: `Priority tier deactivated.` });
    } catch (err) {
        console.error("deleteSLAPolicy Error:", err);
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
    const { priority_id, resolution_time_hours, first_response_hrs, escalation_1_min, escalation_2_min, escalation_3_min } = req.body;

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
                `UPDATE sla_policies_new SET resolution_hrs = ?, first_response_hrs = ?, escalation_1_min = ?, escalation_2_min = ?, escalation_3_min = ? WHERE id = ?`,
                [resolution_time_hours, first_response_hrs, escalation_1_min || null, escalation_2_min || null, escalation_3_min || null, existing[0].id]
            );
        } else {
            await pool.query(
                `INSERT INTO sla_policies_new (name, customer_id, priority_id, resolution_hrs, first_response_hrs, escalation_1_min, escalation_2_min, escalation_3_min)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [`Override - Customer ${customerId} - Prio ${priority_id}`, customerId, priority_id, resolution_time_hours, first_response_hrs, escalation_1_min || null, escalation_2_min || null, escalation_3_min || null]
            );
        }

        return res.json({ success: true, message: "Customer SLA override saved." });
    } catch (err) {
        console.error("updateCustomerSLAPolicy:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/sla/calendar — Fetch the default calendar or a specific one
export const getSLACalendar = async (req, res) => {
    try {
        const pool = connectDB();
        const calendar = await getSlaCalendar(pool, null); // Fetches the default calendar
        
        if (!calendar) {
            return res.status(404).json({ success: false, message: "Default SLA calendar not found." });
        }

        // Normalize TIME strings (MySQL returns "HH:MM:SS" natively in some drivers or pure strings)
        // Ensure UI receives standard "HH:MM" for <input type="time" />
        if (calendar.businessHours) {
            calendar.businessHours = calendar.businessHours.map(bh => ({
                ...bh,
                start_time: bh.start_time.substring(0, 5),
                end_time: bh.end_time.substring(0, 5)
            }));
        }

        return res.json({ success: true, calendar });
    } catch (err) {
        console.error("getSLACalendar:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PUT /api/sla/calendar — Update the default calendar
export const updateSLACalendar = async (req, res) => {
    const { id, timezone, businessHours, holidays } = req.body;

    try {
        const pool = connectDB();
        await pool.query('START TRANSACTION');

        // 1. Single Calendar Assumption Note:
        // Currently, we only edit the default calendar (or the explicitly passed ID).
        // If the schema evolves to multi-calendars per project, this logic stays the same but the ID must be required.
        let targetId = id;
        if (!targetId) {
            const [rows] = await pool.query(`SELECT id FROM sla_calendars WHERE is_default = 1 LIMIT 1`);
            if (rows.length) targetId = rows[0].id;
            else throw new Error("No default calendar found.");
        }

        // 2. Update timezone
        if (timezone) {
            await pool.query(`UPDATE sla_calendars SET timezone = ? WHERE id = ?`, [timezone, targetId]);
        }

        // 3. Clear and Reset Business Hours
        if (businessHours && Array.isArray(businessHours)) {
            await pool.query(`DELETE FROM sla_business_hours WHERE calendar_id = ?`, [targetId]);
            
            if (businessHours.length > 0) {
                const bhValues = businessHours.map(bh => [
                    targetId,
                    bh.day_of_week,
                    // Normalize standard "HH:MM" (from UI) back to "HH:MM:00" for DB strictness
                    bh.start_time.length === 5 ? `${bh.start_time}:00` : bh.start_time,
                    bh.end_time.length === 5 ? `${bh.end_time}:00` : bh.end_time
                ]);
                await pool.query(
                    `INSERT INTO sla_business_hours (calendar_id, day_of_week, start_time, end_time) VALUES ?`,
                    [bhValues]
                );
            }
        }

        // 4. Clear and Reset Holidays
        // It is safe to use an atomic clear-and-reinsert because sla_holidays has no secondary FKs referencing it
        if (holidays && Array.isArray(holidays)) {
            await pool.query(`DELETE FROM sla_holidays WHERE calendar_id = ?`, [targetId]);
            
            if (holidays.length > 0) {
                // Ensure date string is formatted correctly if it came in ISO format
                const holValues = holidays.map(h => [
                    targetId,
                    h.holiday_date.split('T')[0], // Extract just YYYY-MM-DD
                    h.name
                ]);
                await pool.query(
                    `INSERT INTO sla_holidays (calendar_id, holiday_date, name) VALUES ?`,
                    [holValues]
                );
            }
        }

        await pool.query('COMMIT');
        return res.json({ success: true, message: "Calendar updated successfully" });
    } catch (err) {
        await connectDB().query('ROLLBACK');
        console.error("updateSLACalendar:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
