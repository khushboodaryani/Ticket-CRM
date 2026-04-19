// modules/customers/customerController.js
import connectDB from "../../db/index.js";
import { generateCode } from "../../services/generateCode.js";

// GET /api/customers
export const getCustomers = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT c.*, 
                    (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id AND p.is_deleted = 0) as project_count,
                    dp.name as default_project_name
             FROM customers c 
             LEFT JOIN projects dp ON c.default_project_id = dp.id
             WHERE c.is_deleted = 0
             ORDER BY c.created_at DESC`
        );

        // Attach domains for each customer
        if (rows.length > 0) {
            const customerIds = rows.map(r => r.id);
            const [allDomains] = await pool.query(
                `SELECT cd.*, proj.name as project_name
                 FROM customer_domains cd
                 LEFT JOIN projects proj ON cd.project_id = proj.id
                 WHERE cd.customer_id IN (?)
                 ORDER BY cd.project_id IS NULL DESC, cd.domain ASC`,
                [customerIds]
            );
            const domainMap = {};
            for (const d of allDomains) {
                if (!domainMap[d.customer_id]) domainMap[d.customer_id] = [];
                domainMap[d.customer_id].push(d);
            }
            for (const row of rows) {
                row.domains = domainMap[row.id] || [];
            }
        }

        return res.json({ success: true, customers: rows });
    } catch (err) {
        console.error("getCustomers:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/customers/:id
export const getCustomerById = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT c.*, 
                    (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id AND p.is_deleted = 0) as project_count,
                    dp.name as default_project_name
             FROM customers c
             LEFT JOIN projects dp ON c.default_project_id = dp.id
             WHERE c.id=? AND c.is_deleted = 0`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: "Customer not found or has been archived." });
        const [projects] = await pool.query(`SELECT * FROM projects WHERE customer_id=? AND is_deleted = 0`, [req.params.id]);
        const [domains] = await pool.query(
            `SELECT cd.*, proj.name as project_name
             FROM customer_domains cd
             LEFT JOIN projects proj ON cd.project_id = proj.id
             WHERE cd.customer_id = ?
             ORDER BY cd.project_id IS NULL DESC, cd.domain ASC`,
            [req.params.id]
        );
        return res.json({ success: true, customer: rows[0], projects, domains });
    } catch (err) {
        console.error("getCustomerById:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/customers
export const createCustomer = async (req, res) => {
    const { name, email, phone, address, default_project_id, sla_overrides } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "Customer name is required." });
    
    const pool = connectDB();
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        // 1. Auto-generate code with locking
        const customer_code = await generateCode(pool, 'CUSTOMER');

        // 2. Insert Customer
        const [result] = await connection.query(
            `INSERT INTO customers (name, email, phone, customer_code, address, default_project_id) VALUES (?,?,?,?,?,?)`,
            [name, email || null, phone || null, customer_code, address || null, default_project_id || null]
        );
        const customerId = result.insertId;

        // 3. Handle SLA Overrides
        if (sla_overrides && Array.isArray(sla_overrides)) {
            for (const sla of sla_overrides) {
                if (sla.priority_id) {
                    await connection.query(
                        `INSERT INTO sla_policies_new (name, customer_id, priority_id, resolution_hrs, first_response_hrs, escalation_1_min, escalation_2_min, escalation_3_min)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [`Override - Customer ${customerId} - Prio ${sla.priority_id}`, customerId, sla.priority_id, sla.resolution_hrs || 4, sla.first_response_hrs || 1.0, sla.escalation_1_min || null, sla.escalation_2_min || null, sla.escalation_3_min || null]
                    );
                }
            }
        }

        // 4. Auto-domain mapping
        const PUBLIC_DOMAINS = new Set([
            'gmail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com',
            'live.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com',
            'protonmail.com', 'proton.me', 'zoho.com', 'zoho.in',
            'yandex.com', 'mail.com', 'gmx.com', 'gmx.net',
            'rediffmail.com', 'msn.com', 'mail.ru',
            'googlemail.com', 'fastmail.com', 'tutanota.com',
        ]);
        if (email && email.includes('@')) {
            const domain = email.split('@')[1].toLowerCase().trim();
            if (domain && !PUBLIC_DOMAINS.has(domain)) {
                await connection.query(
                    `INSERT IGNORE INTO customer_domains (customer_id, project_id, domain) VALUES (?, NULL, ?)`,
                    [customerId, domain]
                );
            }
        }

        await connection.commit();
        return res.status(201).json({ success: true, message: "Customer created.", customerId, customerCode: customer_code });
    } catch (err) {
        await connection.rollback();
        console.error("createCustomer:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    } finally {
        connection.release();
    }
};

// PUT /api/customers/:id
export const updateCustomer = async (req, res) => {
    const { name, email, phone, customer_code, address, default_project_id } = req.body;
    try {
        const pool = connectDB();

        const updates = [];
        const vals = [];
        if (name !== undefined) { updates.push("name=?"); vals.push(name); }
        if (email !== undefined) { updates.push("email=?"); vals.push(email || null); }
        if (phone !== undefined) { updates.push("phone=?"); vals.push(phone || null); }
        if (customer_code !== undefined) { updates.push("customer_code=?"); vals.push(customer_code || null); }
        if (address !== undefined) { updates.push("address=?"); vals.push(address || null); }
        if (default_project_id !== undefined) { updates.push("default_project_id=?"); vals.push(default_project_id || null); }
        if (req.body.resolution_time_hours !== undefined) { updates.push("resolution_time_hours=?"); vals.push(req.body.resolution_time_hours || null); }
        if (req.body.response_time_sec !== undefined) { updates.push("response_time_sec=?"); vals.push(req.body.response_time_sec || null); }

        if (updates.length > 0) {
            vals.push(req.params.id);
            await pool.query(`UPDATE customers SET ${updates.join(", ")} WHERE id=?`, vals);
        }

        return res.json({ success: true, message: "Customer updated." });
    } catch (err) {
        console.error("updateCustomer:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// DELETE /api/customers/:id
export const deleteCustomer = async (req, res) => {
    try {
        const pool = connectDB();
        await pool.query(`UPDATE customers SET is_deleted = 1 WHERE id=?`, [req.params.id]);
        return res.json({ success: true, message: "Customer archived successfully." });
    } catch (err) {
        console.error("deleteCustomer:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
