// src/modules/sla/slaPolicyService.js
import connectDB from "../../db/index.js";
import moment from "moment-timezone";
import { logger } from "../../logger.js";

const DEFAULT_TZ = process.env.TIMEZONE || "Asia/Kolkata";

/**
 * Resolves the frozen timezone for a ticket based on hierarchy:
 * Customer -> Project -> Global Default
 */
export async function resolveTicketTimezone(pool, { customerId, projectId }) {
    // 1. Customer Timezone
    if (customerId) {
        try {
            const [rows] = await pool.query(`SELECT timezone FROM customers WHERE id = ?`, [customerId]);
            if (rows[0]?.timezone) return rows[0].timezone;
        } catch (e) {
            // Ignore if timezone column doesn't exist yet
        }
    }

    // 2. Project Timezone
    if (projectId) {
        try {
            const [rows] = await pool.query(`SELECT timezone FROM projects WHERE id = ?`, [projectId]);
            if (rows[0]?.timezone) return rows[0].timezone;
        } catch (e) {
            // Ignore if timezone column doesn't exist yet
        }
    }

    // 3. System Default Calendar
    const [rows] = await pool.query(`SELECT timezone FROM sla_calendars WHERE is_default = 1 LIMIT 1`);
    return rows[0]?.timezone || DEFAULT_TZ;
}

/**
 * Resolves the effective SLA policy (Project -> Customer -> Global Fallback)
 */
export async function resolveSlaPolicy(pool, { customerId, projectId, priorityId }) {
    // RESOLUTION ORDER:
    // 1. Customer + Priority
    // 2. Project + Priority
    // 3. Global Default for that Priority
    
    let query = `
        SELECT * FROM sla_policies_new 
        WHERE priority_id = ? AND is_active = 1
        ORDER BY 
            CASE 
                WHEN customer_id = ? THEN 1
                WHEN project_id = ? THEN 2
                WHEN customer_id IS NULL AND project_id IS NULL THEN 3
                ELSE 4 
            END ASC
        LIMIT 1
    `;
    
    const [rows] = await pool.query(query, [priorityId, customerId || 0, projectId || 0]);
    
    if (rows.length) return rows[0];

    // Extreme Fallback (Safe defaults)
    return {
        id: null,
        first_response_hrs: 2,
        resolution_hrs: 8,
        version: 1
    };
}

/**
 * Generates a thread-safe ticket number using the per-series sequence.
 * Format: [PREFIX]-[5-DIGIT-SEQ] (e.g., P-00001)
 */
export async function generateTicketNumber(pool, priorityId) {
    const [prioRows] = await pool.query(`
        SELECT p.category_id, c.prefix 
        FROM priorities p
        JOIN sla_priority_categories c ON p.category_id = c.id
        WHERE p.id = ?
    `, [priorityId]);

    if (!prioRows.length) throw new Error("Invalid priority_id for numbering");
    const { category_id, prefix } = prioRows[0];

    // Atomic increment using FOR UPDATE on the category sequence
    await pool.query('START TRANSACTION');
    try {
        const [seqRows] = await pool.query(
            `SELECT last_seq FROM priority_sequences WHERE category_id = ? FOR UPDATE`,
            [category_id]
        );
        
        const nextSeq = (seqRows[0]?.last_seq || 0) + 1;
        
        await pool.query(
            `UPDATE priority_sequences SET last_seq = ? WHERE category_id = ?`,
            [nextSeq, category_id]
        );
        
        await pool.query('COMMIT');
        
        const padded = String(nextSeq).padStart(5, '0');
        return `${prefix}-${padded}`;
    } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
    }
}

/**
 * Fetches the calendar data (business hours + holidays) for SLA calculation.
 */
export async function getSlaCalendar(pool, calendarId = null) {
    const calendarQuery = calendarId 
        ? `SELECT * FROM sla_calendars WHERE id = ?` 
        : `SELECT * FROM sla_calendars WHERE is_default = 1 LIMIT 1`;
    
    const [calRows] = await pool.query(calendarQuery, calendarId ? [calendarId] : []);
    if (!calRows.length) return null;
    const calendar = calRows[0];

    const [bhRows] = await pool.query(`SELECT * FROM sla_business_hours WHERE calendar_id = ?`, [calendar.id]);
    const [holRows] = await pool.query(`SELECT holiday_date FROM sla_holidays WHERE calendar_id = ?`, [calendar.id]);

    return {
        ...calendar,
        businessHours: bhRows,
        holidays: holRows.map(h => h.holiday_date)
    };
}

// Bridge for the controller to fetch all configured policy tiers
export async function getEffectiveSLAPolicies(pool) {
    const [rows] = await pool.query(`
        SELECT 
            sp.id, 
            p.name as priority, 
            p.id as priority_id,
            sp.first_response_hrs, 
            sp.resolution_hrs as resolution_time_hours, 
            sp.version,
            sp.is_active,
            c.name as category_name,
            c.prefix
        FROM sla_policies_new sp
        JOIN priorities p ON sp.priority_id = p.id
        JOIN sla_priority_categories c ON p.category_id = c.id
        WHERE sp.customer_id IS NULL AND sp.project_id IS NULL
        ORDER BY c.sort_order ASC, p.\`level\` ASC
    `);
    return rows;
}

// Returns full priority objects for the UI
export async function getConfiguredPriorities(pool) {
    const [rows] = await pool.query(`
        SELECT p.id, p.name, c.prefix, p.color_code, p.\`level\`, c.name as category 
        FROM priorities p
        JOIN sla_priority_categories c ON p.category_id = c.id
        WHERE p.is_active = 1
        ORDER BY c.sort_order ASC, p.\`level\` ASC
    `);
    return rows;
}
