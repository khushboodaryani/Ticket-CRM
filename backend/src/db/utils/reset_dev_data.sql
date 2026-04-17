-- Ticket CRM Data Reset Script
-- This script clears all operational data (Tickets, Customers, Projects) while preserving system configuration.

USE ticket_crm;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Clear Ticket Logs & Activities
TRUNCATE TABLE ticket_activities;
TRUNCATE TABLE ticket_queue_logs;
TRUNCATE TABLE ticket_tasks;
TRUNCATE TABLE escalation_logs;
TRUNCATE TABLE sla_event_logs;
TRUNCATE TABLE workflow_runs;
TRUNCATE TABLE routing_execution_logs;
TRUNCATE TABLE audit_logs;

-- 2. Clear Communication Data
TRUNCATE TABLE conversation_message_attachments;
TRUNCATE TABLE conversation_messages;
TRUNCATE TABLE conversation_participants;
TRUNCATE TABLE conversation_participant_removals;
TRUNCATE TABLE conversations;

-- 3. Clear Notifications & Mail Logs
TRUNCATE TABLE in_app_notifications;
TRUNCATE TABLE email_logs;
TRUNCATE TABLE held_emails;
TRUNCATE TABLE domain_approval_requests;

-- 4. Clear Core Operational Data
TRUNCATE TABLE tickets;
TRUNCATE TABLE projects;
-- Selective delete for SLA policies: Keep global ones (customer_id IS NULL), delete overrides.
DELETE FROM sla_policies_new WHERE customer_id IS NOT NULL OR project_id IS NOT NULL;
TRUNCATE TABLE customer_domains;
TRUNCATE TABLE customers;

-- 5. Clear Dashboard Data
TRUNCATE TABLE dashboard_snapshots;

-- 6. Reset Sequences
UPDATE priority_sequences SET last_seq = 0;
UPDATE code_sequences SET current_value = 0; -- Keep the configuration rows, just reset the count

SET FOREIGN_KEY_CHECKS = 1;

-- Verification Queries
SELECT 'Tickets' as TableName, COUNT(*) as Count FROM tickets
UNION ALL
SELECT 'Customers', COUNT(*) FROM customers
UNION ALL
SELECT 'Projects', COUNT(*) FROM projects
UNION ALL
SELECT 'Users (Preserved)', COUNT(*) FROM users;
