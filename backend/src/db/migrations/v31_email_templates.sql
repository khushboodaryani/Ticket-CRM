-- v31_email_templates.sql

CREATE TABLE IF NOT EXISTS email_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    subject VARCHAR(255) NOT NULL,
    heading VARCHAR(255) NOT NULL,
    body_text TEXT NOT NULL,
    footer_text VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    variables JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed Initial Templates
INSERT INTO email_templates (name, subject, heading, body_text, footer_text, variables) VALUES
('TICKET_ACK', 
 '[{{ticket_number}}] {{subject}}', 
 'Ticket Acknowledgement', 
 'Your request has been received (Ticket {{ticket_number}}). Our team will respond shortly.', 
 'Regards, Team Multycomm', 
 '["ticket_number", "subject", "category", "priority", "first_response_target", "etr", "description_html", "customer_name"]'),

('TICKET_ASSIGNED', 
 'Re: [{{ticket_number}}] {{subject}}', 
 'Agent Assigned to Your Ticket', 
 'Good news! Your support request has been assigned to a team member.', 
 'Regards, Team Multycomm', 
 '["ticket_number", "subject", "agent_name", "etr", "customer_name"]'),

('SLA_BREACH', 
 'Re: [{{ticket_number}}] {{subject}} - Escalated', 
 'Ticket Escalated', 
 'We sincerely apologize — your support request has exceeded its expected resolution time.', 
 'Regards, Team Multycomm', 
 '["ticket_number", "subject", "priority", "assigned_to_name", "etr", "customer_name"]');
