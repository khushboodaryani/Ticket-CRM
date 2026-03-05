// src/controllers/projectController.js
import connectDB from "../db/index.js";

// GET /api/projects
export const getProjects = async (req, res) => {
    try {
        const pool = connectDB();
        const { customer_id } = req.query;
        let where = "1=1";
        const params = [];
        if (customer_id) { where += " AND p.customer_id=?"; params.push(customer_id); }

        const [rows] = await pool.query(
            `SELECT p.*, c.name as customer_name,
              COUNT(DISTINCT t.id) as ticket_count
       FROM projects p
       JOIN customers c ON p.customer_id = c.id
       LEFT JOIN tickets t ON t.project_id = p.id
       WHERE ${where}
       GROUP BY p.id ORDER BY p.created_at DESC`,
            params
        );
        return res.json({ success: true, projects: rows });
    } catch (err) {
        console.error("getProjects:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/projects/:id
export const getProjectById = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT p.*, c.name as customer_name FROM projects p
       JOIN customers c ON p.customer_id = c.id WHERE p.id=?`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: "Project not found." });
        return res.json({ success: true, project: rows[0] });
    } catch (err) {
        console.error("getProjectById:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/projects
export const createProject = async (req, res) => {
    const { customer_id, name, project_code, description } = req.body;
    if (!customer_id || !name)
        return res.status(400).json({ success: false, message: "customer_id and name are required." });
    try {
        const pool = connectDB();
        const [result] = await pool.query(
            `INSERT INTO projects (customer_id, name, project_code, description) VALUES (?,?,?,?)`,
            [customer_id, name, project_code || null, description || null]
        );
        return res.status(201).json({ success: true, message: "Project created.", projectId: result.insertId });
    } catch (err) {
        console.error("createProject:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PUT /api/projects/:id
export const updateProject = async (req, res) => {
    const { name, project_code, description } = req.body;
    try {
        const pool = connectDB();
        await pool.query(
            `UPDATE projects SET name=COALESCE(?,name), project_code=COALESCE(?,project_code), description=COALESCE(?,description) WHERE id=?`,
            [name, project_code, description, req.params.id]
        );
        return res.json({ success: true, message: "Project updated." });
    } catch (err) {
        console.error("updateProject:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// DELETE /api/projects/:id
export const deleteProject = async (req, res) => {
    try {
        const pool = connectDB();
        await pool.query(`DELETE FROM projects WHERE id=?`, [req.params.id]);
        return res.json({ success: true, message: "Project deleted." });
    } catch (err) {
        console.error("deleteProject:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
