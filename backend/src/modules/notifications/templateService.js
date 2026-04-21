import { logger } from '../../logger.js';

export const TEMPLATE_KEYS = {
    ACKNOWLEDGEMENT: 'ticket_acknowledgement',
    ASSIGNMENT: 'ticket_assignment',
    SLA_BREACH: 'sla_breach',
};

export const TEMPLATE_VARIABLES = [
    { key: 'ticket_number', label: 'Ticket Number' },
    { key: 'ticket_subject', label: 'Ticket Subject' },
    { key: 'category', label: 'Category' },
    { key: 'priority', label: 'Priority' },
    { key: 'description_html', label: 'Description (HTML-safe)' },
    { key: 'first_response_target', label: 'First Response Target' },
    { key: 'etr', label: 'ETR / Deadline' },
    { key: 'assigned_to_name', label: 'Assigned User Name' },
    { key: 'customer_name', label: 'Customer Name' },
    { key: 'company_name', label: 'Company Name' },
    { key: 'conversation_trail_html', label: 'Conversation Trail (HTML)' },
];

const RAW_HTML_KEYS = new Set(['description_html', 'conversation_trail_html']);

async function ensureNotificationTemplatesTable(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS notification_templates (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            template_key VARCHAR(64) NOT NULL UNIQUE,
            name VARCHAR(120) NOT NULL,
            description VARCHAR(255) NULL,
            subject_template VARCHAR(255) NOT NULL,
            heading VARCHAR(255) NULL,
            body_text TEXT NULL,
            footer_text VARCHAR(255) NULL,
            body_html MEDIUMTEXT NOT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    for (const templateKey of Object.values(TEMPLATE_KEYS)) {
        const fallback = DEFAULT_TEMPLATE_MAP[templateKey];
        await pool.query(
            `INSERT INTO notification_templates (template_key, name, description, subject_template, heading, body_text, footer_text, body_html, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE
               name = VALUES(name),
               description = VALUES(description)`,
            [
                templateKey,
                fallback.name,
                fallback.description,
                fallback.subject_template,
                fallback.heading,
                fallback.body_text,
                fallback.footer_text,
                fallback.body_html,
            ]
        );
    }
}

export const DEFAULT_TEMPLATE_MAP = {
    [TEMPLATE_KEYS.ACKNOWLEDGEMENT]: {
        name: 'Ticket Acknowledgement',
        description: 'Sent when a new ticket is created and acknowledged to the customer.',
        subject_template: '[{{ticket_number}}] {{ticket_subject}}',
        heading: 'Ticket Acknowledgement',
        body_text: 'Your request has been received (Ticket {{ticket_number}}). Our team will respond shortly.',
        footer_text: 'Team Multycomm',
        body_html: `...`, // Keep current fallback for internal use
    },
    [TEMPLATE_KEYS.ASSIGNMENT]: {
        name: 'Ticket Assignment',
        description: 'Sent when a ticket is assigned or reassigned to an owner.',
        subject_template: 'Re: [{{ticket_number}}] {{ticket_subject}}',
        heading: 'Agent Assigned to Your Ticket',
        body_text: 'Good news! Your support request has been assigned to a team member.',
        footer_text: 'Team Multycomm',
        body_html: `...`,
    },
    [TEMPLATE_KEYS.SLA_BREACH]: {
        name: 'SLA Breach',
        description: 'Sent when a ticket breaches the configured resolution SLA.',
        subject_template: 'Re: [{{ticket_number}}] {{ticket_subject}} - Escalated',
        heading: 'Ticket Escalated',
        body_text: 'We sincerely apologize — your support request has exceeded its expected resolution time.',
        footer_text: 'Team Multycomm',
        body_html: `...`,
    },
};

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderTemplateString(template, variables = {}) {
    return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        const value = variables[key] ?? '';
        return RAW_HTML_KEYS.has(key) ? String(value) : escapeHtml(value);
    });
}

export async function fetchNotificationTemplates(pool) {
    try {
        await ensureNotificationTemplatesTable(pool);
    } catch (err) {
        logger.warn(`[TemplateService] Failed to ensure notification_templates table, using defaults: ${err.message}`);
        return Object.values(TEMPLATE_KEYS).map((templateKey) => {
            const fallback = DEFAULT_TEMPLATE_MAP[templateKey];
            return {
                id: null,
                template_key: templateKey,
                name: fallback.name,
                description: fallback.description,
                subject_template: fallback.subject_template,
                body_html: fallback.body_html,
                is_active: 1,
                updated_at: null,
                uses_default: true,
                default_subject_template: fallback.subject_template,
                default_body_html: fallback.body_html,
            };
        });
    }

    const [rows] = await pool.query(
        `SELECT id, template_key, name, description, subject_template, heading, body_text, footer_text, body_html, is_active, updated_at
         FROM notification_templates
         ORDER BY id ASC`
    );

    return Object.values(TEMPLATE_KEYS).map((templateKey) => {
        const saved = rows.find(row => row.template_key === templateKey);
        const fallback = DEFAULT_TEMPLATE_MAP[templateKey];
        return {
            id: saved?.id || null,
            template_key: templateKey,
            name: saved?.name || fallback.name,
            description: saved?.description || fallback.description,
            subject_template: saved?.subject_template || fallback.subject_template,
            heading: saved?.heading || fallback.heading,
            body_text: saved?.body_text || fallback.body_text,
            footer_text: saved?.footer_text || fallback.footer_text,
            body_html: saved?.body_html || fallback.body_html,
            is_active: saved?.is_active ?? 1,
            updated_at: saved?.updated_at || null,
            uses_default: !saved,
            default_subject_template: fallback.subject_template,
            default_body_html: fallback.body_html,
        };
    });
}

export async function ensureNotificationTemplates(pool) {
    await ensureNotificationTemplatesTable(pool);
}

export async function getNotificationTemplate(pool, templateKey) {
    try {
        const templates = await fetchNotificationTemplates(pool);
        return templates.find(template => template.template_key === templateKey) || null;
    } catch (err) {
        logger.warn(`[TemplateService] Failed to fetch template ${templateKey}, using fallback: ${err.message}`);
        const fallback = DEFAULT_TEMPLATE_MAP[templateKey];
        return fallback ? {
            id: null,
            template_key: templateKey,
            ...fallback,
            is_active: 1,
            uses_default: true,
            default_subject_template: fallback.subject_template,
            default_body_html: fallback.body_html,
        } : null;
    }
}

export async function renderNotificationTemplate(pool, templateKey, variables) {
    const template = await getNotificationTemplate(pool, templateKey);
    const fallback = DEFAULT_TEMPLATE_MAP[templateKey];
    const source = template || fallback;

    if (!source) {
        throw new Error(`Unknown notification template key: ${templateKey}`);
    }

    // If source has specifically defined blocks, use them to build the layout
    let finalHtml = source.body_html;
    if (source.heading && source.body_text) {
        finalHtml = buildEmailLayout(templateKey, source.heading, source.body_text, source.footer_text || 'Team');
    }

    return {
        template,
        subject: renderTemplateString(source.subject_template, variables),
        html: renderTemplateString(finalHtml, variables),
    };
}

function buildEmailLayout(templateKey, heading, bodyText, footer) {
    const accentColor = templateKey === TEMPLATE_KEYS.SLA_BREACH ? '#dc2626' : '#4f8ef7';
    const bgColor = templateKey === TEMPLATE_KEYS.SLA_BREACH ? '#fef2f2' : (templateKey === TEMPLATE_KEYS.ASSIGNMENT ? '#f0fdf4' : '#ffffff');
    const borderColor = templateKey === TEMPLATE_KEYS.SLA_BREACH ? '#fecaca' : (templateKey === TEMPLATE_KEYS.ASSIGNMENT ? '#bbf7d0' : '#e2e8f0');
    const textColor = templateKey === TEMPLATE_KEYS.SLA_BREACH ? '#991b1b' : (templateKey === TEMPLATE_KEYS.ASSIGNMENT ? '#166534' : '#64748b');

    // Base structural elements that stay constant for "User Friendly" mode
    let middleSection = '';
    if (templateKey === TEMPLATE_KEYS.ACKNOWLEDGEMENT) {
        middleSection = `
  <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b; width:40%"><strong>Ticket Number</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{ticket_number}}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Category</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{category}}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Priority</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{priority}}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>First Response Target</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{first_response_target}}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>ETR (Deadline)</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{etr}}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b; vertical-align:top"><strong>Description</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; white-space: pre-wrap;">{{description_html}}</td></tr>
  </table>`;
    } else if (templateKey === TEMPLATE_KEYS.ASSIGNMENT) {
        middleSection = `
  <div style="background:#f0fdf4; padding: 15px; border-radius:8px; border:1px solid #bbf7d0; margin: 20px 0;">
      <p style="margin:0; font-size:14px; color:#166534;"><strong>{{assigned_to_name}}</strong> has been assigned to handle your ticket <strong>{{ticket_number}}</strong>.</p>
  </div>
  <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b; width:40%"><strong>Ticket Number</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{ticket_number}}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Subject</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{ticket_subject}}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Assigned To</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{assigned_to_name}}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>ETR (Deadline)</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{etr}}</td></tr>
  </table>`;
    } else if (templateKey === TEMPLATE_KEYS.SLA_BREACH) {
        middleSection = `
  <div style="background:#fef2f2; padding: 15px; border-radius:8px; border:1px solid #fecaca; margin: 20px 0;">
      <p style="margin:0; font-size:14px; color:#991b1b;">Your ticket <strong>{{ticket_number}}</strong> has been automatically escalated for priority resolution.</p>
  </div>
  <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b; width:40%"><strong>Ticket Number</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{ticket_number}}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Subject</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{ticket_subject}}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Priority</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{priority}}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Assigned To</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{assigned_to_name}}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #64748b;"><strong>Original Deadline</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">{{etr}}</td></tr>
  </table>`;
    }

    return `<div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 680px; margin: 0 auto;">
  <h2 style="color: ${accentColor}; margin-bottom: 4px;">${heading}</h2>
  <p style="color: #64748b; margin-top: 0;">${bodyText}</p>
  ${middleSection}
  <p style="font-size: 13px; color: #666;">To reply or add more details, simply respond to this email - your message will automatically be added to the ticket.</p>
  {{conversation_trail_html}}
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
  <p style="font-size: 12px; color: #999;">Regards,<br/><strong>${footer}</strong></p>
</div>`;
}

export function buildTemplatePreviewVariables(templateKey) {
    const base = {
        ticket_number: 'R-00042',
        ticket_subject: 'Unable to sync support mailbox',
        category: 'Email Gateway',
        priority: templateKey === TEMPLATE_KEYS.SLA_BREACH ? 'P1' : 'R2',
        description_html: 'Customer reported delayed sync after password rotation.<br/>Mailbox reconnect is in progress.',
        first_response_target: '2 hour(s)',
        etr: '2026-04-21 18:30:00',
        assigned_to_name: 'Aarav Singh',
        customer_name: 'Acme Industries',
        company_name: 'Team Multycomm',
        conversation_trail_html: '<div style="margin-top:18px; padding:12px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;"><div style="font-size:12px; color:#64748b; margin-bottom:6px; font-weight:600;">Conversation History</div><div style="font-size:13px; color:#334155;">Previous customer email content will appear here.</div></div>',
    };
    return base;
}
