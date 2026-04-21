-- v32_notification_templates_upgrade.sql

ALTER TABLE notification_templates 
ADD COLUMN heading VARCHAR(255) AFTER subject_template,
ADD COLUMN body_text TEXT AFTER heading,
ADD COLUMN footer_text VARCHAR(255) AFTER body_text;

-- Update existing templates with default content derived from their HTML (Approximate)
UPDATE notification_templates SET 
heading = 'Ticket Acknowledgement',
body_text = 'Your request has been received (Ticket {{ticket_number}}). Our team will respond shortly.',
footer_text = 'Team Multycomm'
WHERE template_key = 'ticket_acknowledgement';

UPDATE notification_templates SET 
heading = 'Agent Assigned to Your Ticket',
body_text = 'Good news! Your support request has been assigned to a team member.',
footer_text = 'Team Multycomm'
WHERE template_key = 'ticket_assignment';

UPDATE notification_templates SET 
heading = 'Ticket Escalated',
body_text = 'We sincerely apologize — your support request has exceeded its expected resolution time.',
footer_text = 'Team Multycomm'
WHERE template_key = 'sla_breach';
