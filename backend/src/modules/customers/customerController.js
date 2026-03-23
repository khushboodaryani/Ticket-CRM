// modules/customers/customerController.js
import connectDB from "../../db/index.js";
import { generateCode } from "../../services/generateCode.js";

// GET /api/customers
export const getCustomers = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT c.*, COUNT(p.id) as project_count
       FROM customers c LEFT JOIN projects p ON c.id = p.customer_id
       GROUP BY c.id ORDER BY c.created_at DESC`
        );
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
            `SELECT c.*, COUNT(p.id) as project_count FROM customers c
       LEFT JOIN projects p ON c.id = p.customer_id
       WHERE c.id=? GROUP BY c.id`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: "Customer not found." });
        const [projects] = await pool.query(`SELECT * FROM projects WHERE customer_id=?`, [req.params.id]);
        return res.json({ success: true, customer: rows[0], projects });
    } catch (err) {
        console.error("getCustomerById:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/customers
export const createCustomer = async (req, res) => {
    const { name, email, phone, address } = req.body; // Remove customer_code from body
    if (!name) return res.status(400).json({ success: false, message: "Customer name is required." });
    try {
        const pool = connectDB();
        
        // Auto-generate code with locking
        const customer_code = await generateCode(pool, 'CUSTOMER');

        const [result] = await pool.query(
            `INSERT INTO customers (name, email, phone, customer_code, address) VALUES (?,?,?,?,?)`,
            [name, email || null, phone || null, customer_code, address || null]
        );
        return res.status(201).json({ success: true, message: "Customer created.", customerId: result.insertId, customerCode: customer_code });
    } catch (err) {
        console.error("createCustomer:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PUT /api/customers/:id
export const updateCustomer = async (req, res) => {
    const { name, email, phone, customer_code, address } = req.body;
    try {
        const pool = connectDB();
        await pool.query(
            `UPDATE customers SET name=COALESCE(?,name), email=COALESCE(?,email), phone=COALESCE(?,phone),
       customer_code=COALESCE(?,customer_code), address=COALESCE(?,address) WHERE id=?`,
            [name, email, phone, customer_code, address, req.params.id]
        );
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
        await pool.query(`DELETE FROM customers WHERE id=?`, [req.params.id]);
        return res.json({ success: true, message: "Customer deleted." });
    } catch (err) {
        console.error("deleteCustomer:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
