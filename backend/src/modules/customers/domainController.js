// modules/customers/domainController.js
// CRUD for customer_domains — maps email domains to customers/projects
import connectDB from "../../db/index.js";

// GET /api/domains — list all domain mappings (admin overview)
export const getAllDomains = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT cd.*, c.name as customer_name, p.name as project_name
             FROM customer_domains cd
             JOIN customers c ON cd.customer_id = c.id
             LEFT JOIN projects p ON cd.project_id = p.id
             ORDER BY cd.domain ASC`
        );
        return res.json({ success: true, domains: rows });
    } catch (err) {
        console.error("getAllDomains:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// GET /api/customers/:id/domains — list domains for a specific customer
export const getCustomerDomains = async (req, res) => {
    try {
        const pool = connectDB();
        const [rows] = await pool.query(
            `SELECT cd.*, p.name as project_name
             FROM customer_domains cd
             LEFT JOIN projects p ON cd.project_id = p.id
             WHERE cd.customer_id = ?
             ORDER BY cd.project_id IS NULL DESC, cd.domain ASC`,
            [req.params.id]
        );
        return res.json({ success: true, domains: rows });
    } catch (err) {
        console.error("getCustomerDomains:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// ============================================================
// Public domain blocklist — these should NEVER be mapped to a customer.
// If someone sends from gmail.com, they go through approval, not auto-routing.
// ============================================================
const PUBLIC_DOMAINS = new Set([
    'gmail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com',
    'live.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com',
    'protonmail.com', 'proton.me', 'zoho.com', 'zoho.in',
    'yandex.com', 'mail.com', 'gmx.com', 'gmx.net',
    'rediffmail.com', 'msn.com', 'mail.ru',
    'googlemail.com', 'fastmail.com', 'tutanota.com',
]);

/**
 * Extracts the parent domain from a subdomain.
 * e.g., 'shams.multycomm.com' → 'multycomm.com'
 * e.g., 'multycomm.com' → null (no parent, it's already a root domain)
 */
function getParentDomain(domain) {
    const parts = domain.split('.');
    if (parts.length <= 2) return null; // already a root domain like 'example.com'
    return parts.slice(1).join('.');
}

/**
 * Validates domain against parent-child conflict rules:
 * - A subdomain MUST belong to same customer as its parent domain
 * - A parent domain MUST not conflict with existing child domains under different customers
 */
async function validateDomainConflicts(pool, domain, customerId) {
    // Rule 3: Check parent domain conflict
    // If shams.multycomm.com is being added to Customer B,
    // but multycomm.com already belongs to Customer A → BLOCK
    const parentDomain = getParentDomain(domain);
    if (parentDomain) {
        const [parentMatch] = await pool.query(
            'SELECT customer_id, domain FROM customer_domains WHERE domain = ? AND is_active = 1 LIMIT 1',
            [parentDomain]
        );
        if (parentMatch.length && parentMatch[0].customer_id !== parseInt(customerId)) {
            return {
                valid: false,
                message: `Domain conflict: parent domain '${parentDomain}' belongs to a different customer. All subdomains must belong to the same customer as the parent.`
            };
        }
    }

    // Rule 3 reverse: Check child domain conflict
    // If multycomm.com is being added to Customer B,
    // but shams.multycomm.com already belongs to Customer A → BLOCK
    const [childMatches] = await pool.query(
        `SELECT customer_id, domain FROM customer_domains 
         WHERE domain LIKE ? AND customer_id != ? AND is_active = 1 LIMIT 1`,
        [`%.${domain}`, customerId]
    );
    if (childMatches.length) {
        return {
            valid: false,
            message: `Domain conflict: subdomain '${childMatches[0].domain}' already belongs to a different customer. Cannot map parent domain '${domain}' to a different customer.`
        };
    }

    return { valid: true };
}

// POST /api/customers/:id/domains — add domain mapping
export const addCustomerDomain = async (req, res) => {
    const { domain, project_id } = req.body;
    const customer_id = req.params.id;

    if (!domain || !domain.trim()) {
        return res.status(400).json({ success: false, message: "Domain is required." });
    }

    const cleanDomain = domain.trim().toLowerCase().replace(/^@/, '');

    // Validate domain format
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(cleanDomain)) {
        return res.status(400).json({ success: false, message: "Invalid domain format." });
    }

    // Rule 5: Block public email domains
    if (PUBLIC_DOMAINS.has(cleanDomain)) {
        return res.status(400).json({
            success: false,
            message: `Cannot map public email domain '${cleanDomain}'. Public domains like Gmail, Yahoo, Outlook cannot be assigned to a single customer.`
        });
    }

    try {
        const pool = connectDB();

        // Verify customer exists
        const [cust] = await pool.query('SELECT id FROM customers WHERE id = ?', [customer_id]);
        if (!cust.length) return res.status(404).json({ success: false, message: "Customer not found." });

        // Rule 4: If project_id provided, verify it belongs to this customer
        if (project_id) {
            const [proj] = await pool.query(
                'SELECT id FROM projects WHERE id = ? AND customer_id = ?',
                [project_id, customer_id]
            );
            if (!proj.length) {
                return res.status(400).json({ success: false, message: "Project not found or doesn't belong to this customer." });
            }
        }

        // Rule 3: Validate parent-child domain conflicts
        const conflictCheck = await validateDomainConflicts(pool, cleanDomain, customer_id);
        if (!conflictCheck.valid) {
            return res.status(409).json({ success: false, message: conflictCheck.message });
        }

        const [result] = await pool.query(
            `INSERT INTO customer_domains (customer_id, project_id, domain) VALUES (?, ?, ?)`,
            [customer_id, project_id || null, cleanDomain]
        );

        return res.status(201).json({
            success: true,
            message: `Domain '${cleanDomain}' mapped successfully.`,
            domainId: result.insertId
        });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: `Domain '${cleanDomain}' is already mapped.` });
        }
        console.error("addCustomerDomain:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// PUT /api/domains/:domainId — update domain mapping
export const updateDomain = async (req, res) => {
    const { project_id, is_active } = req.body;
    try {
        const pool = connectDB();

        const [existing] = await pool.query('SELECT * FROM customer_domains WHERE id = ?', [req.params.domainId]);
        if (!existing.length) return res.status(404).json({ success: false, message: "Domain mapping not found." });

        // If project_id provided, verify it belongs to the same customer
        if (project_id) {
            const [proj] = await pool.query(
                'SELECT id FROM projects WHERE id = ? AND customer_id = ?',
                [project_id, existing[0].customer_id]
            );
            if (!proj.length) {
                return res.status(400).json({ success: false, message: "Project not found or doesn't belong to this customer." });
            }
        }

        const updates = [];
        const vals = [];
        if (project_id !== undefined) { updates.push("project_id = ?"); vals.push(project_id || null); }
        if (is_active !== undefined) { updates.push("is_active = ?"); vals.push(is_active ? 1 : 0); }

        if (!updates.length) return res.status(400).json({ success: false, message: "Nothing to update." });

        vals.push(req.params.domainId);
        await pool.query(`UPDATE customer_domains SET ${updates.join(", ")} WHERE id = ?`, vals);

        return res.json({ success: true, message: "Domain mapping updated." });
    } catch (err) {
        console.error("updateDomain:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};

// DELETE /api/domains/:domainId — remove domain mapping
export const deleteDomain = async (req, res) => {
    try {
        const pool = connectDB();
        const [result] = await pool.query('DELETE FROM customer_domains WHERE id = ?', [req.params.domainId]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Domain mapping not found." });
        return res.json({ success: true, message: "Domain mapping deleted." });
    } catch (err) {
        console.error("deleteDomain:", err);
        return res.status(500).json({ success: false, message: "Server error." });
    }
};
