// modules/projects/projectController.js
import connectDB from "../../db/index.js";
import { generateCode } from "../../services/generateCode.js";

// GET /api/projects
export const getProjects = async (req, res) => {
    try {
        const pool = connectDB();
        const { customer_id } = req.query;
        let where = "p.is_deleted = 0";
        const params = [];
        if (customer_id) { where += " AND p.customer_id=?"; params.push(customer_id); }

        const [rows] = await pool.query(
            `SELECT p.*, c.name as customer_name,
              COUNT(DISTINCT t.id) as ticket_count
       FROM projects p
       JOIN customers c ON p.customer_id = c.id
       LEFT JOIN tickets t ON t.project_id = p.id
       WHERE ${where} AND c.is_deleted = 0
       GROUP BY p.id ORDER BY p.created_at DESC`,
            params
        );

        // Attach domain mapping for each project
        if (rows.length > 0) {
            const projectIds = rows.map(r => r.id);
            const [projectDomains] = await pool.query(
                `SELECT * FROM customer_domains WHERE project_id IN (?) AND is_active = 1`,
                [projectIds]
            );
            const domainMap = {};
            for (const d of projectDomains) {
                domainMap[d.project_id] = d;
            }
            for (const row of rows) {
                row.domain = domainMap[row.id]?.domain || null;
                row.domain_id = domainMap[row.id]?.id || null;
            }
        }

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
       JOIN customers c ON p.customer_id = c.id WHERE p.id=? AND p.is_deleted = 0 AND c.is_deleted = 0`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ success: false, message: "Project not found or archived." });

        // Get domain mapping for this project
        const [domains] = await pool.query(
            `SELECT * FROM customer_domains WHERE project_id = ? AND is_active = 1 LIMIT 1`,
            [req.params.id]
        );
        rows[0].domain = domains.length ? domains[0].domain : null;
        rows[0].domain_id = domains.length ? domains[0].id : null;

        return res.json({ success: true, project: rows[0] });
    } catch (err) {
        console.error("getProjectById:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// POST /api/projects
export const createProject = async (req, res) => {
    const { customer_id, name, description, domain, resolution_time_hours, response_time_sec } = req.body;
    if (!customer_id || !name)
        return res.status(400).json({ success: false, message: "customer_id and name are required." });
    try {
        const pool = connectDB();
        
        // Ensure customer exists and is not deleted
        const [cust] = await pool.query('SELECT id FROM customers WHERE id = ? AND is_deleted = 0', [customer_id]);
        if (!cust.length) return res.status(400).json({ success: false, message: "Customer not found or archived." });

        // Auto-generate code with locking
        const project_code = await generateCode(pool, 'PROJECT');

        const [result] = await pool.query(
            `INSERT INTO projects (customer_id, name, project_code, description, resolution_time_hours, response_time_sec) VALUES (?,?,?,?,?,?)`,
            [customer_id, name, project_code, description || null, resolution_time_hours || null, response_time_sec || null]
        );
        const projectId = result.insertId;

        // If domain provided, create a project-level domain mapping
        if (domain && domain.trim()) {
            const cleanDomain = domain.trim().toLowerCase().replace(/^@/, '');
            try {
                await pool.query(
                    `INSERT IGNORE INTO customer_domains (customer_id, project_id, domain) VALUES (?, ?, ?)`,
                    [customer_id, projectId, cleanDomain]
                );
            } catch (domainErr) {
                console.error("Project domain mapping failed (non-fatal):", domainErr.message);
            }
        }

        return res.status(201).json({ success: true, message: "Project created.", projectId, projectCode: project_code });
    } catch (err) {
        console.error("createProject:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PUT /api/projects/:id
export const updateProject = async (req, res) => {
    const { name, project_code, description, domain, resolution_time_hours, response_time_sec } = req.body;
    try {
        const pool = connectDB();
        await pool.query(
            `UPDATE projects SET 
                name=COALESCE(?,name), 
                project_code=COALESCE(?,project_code), 
                description=COALESCE(?,description),
                resolution_time_hours=COALESCE(?,resolution_time_hours),
                response_time_sec=COALESCE(?,response_time_sec)
             WHERE id=?`,
            [name, project_code, description, resolution_time_hours, response_time_sec, req.params.id]
        );

        // Handle domain mapping update if provided
        if (domain !== undefined) {
            const [project] = await pool.query('SELECT customer_id FROM projects WHERE id = ?', [req.params.id]);
            if (project.length) {
                // Remove old project-level domain mappings
                await pool.query('DELETE FROM customer_domains WHERE project_id = ?', [req.params.id]);
                // Add new one if provided
                if (domain && domain.trim()) {
                    const cleanDomain = domain.trim().toLowerCase().replace(/^@/, '');
                    try {
                        await pool.query(
                            `INSERT IGNORE INTO customer_domains (customer_id, project_id, domain) VALUES (?, ?, ?)`,
                            [project[0].customer_id, req.params.id, cleanDomain]
                        );
                    } catch (domainErr) {
                        console.error("Project domain update failed (non-fatal):", domainErr.message);
                    }
                }
            }
        }

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
        await pool.query(`UPDATE projects SET is_deleted = 1 WHERE id=?`, [req.params.id]);
        return res.json({ success: true, message: "Project archived successfully." });
    } catch (err) {
        console.error("deleteProject:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
