-- ============================================================
-- Ticket CRM – v20 Enterprise Automation Hardening
-- Adds determinism, idempotency, and transactional safeguards
-- ============================================================

USE ticket_crm;

-- 1. Add Determinism to Workflow Rules (Priority-based matching)
-- Rules will now be fetched ORDER BY priority DESC
ALTER TABLE workflow_rules ADD COLUMN priority INT DEFAULT 0 AFTER trigger_event;

-- 2. Add Safeguards to Tickets
-- 2a. Idempotency: ensures a workflow only runs once per lifecycle event
ALTER TABLE tickets ADD COLUMN workflow_processed TINYINT(1) DEFAULT 0 AFTER sla_state;
-- 2b. Assignment Source: protects manual agent picks from being overwritten by automation
ALTER TABLE tickets ADD COLUMN assignment_source ENUM('manual', 'auto') DEFAULT 'auto' AFTER workflow_processed;

-- 3. System Config Support
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key   VARCHAR(100) PRIMARY KEY,
    setting_value TEXT         NOT NULL,
    updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default queue — using ID 10 (Domain Queue) as found in current DB
INSERT IGNORE INTO system_settings (setting_key, setting_value) 
VALUES ('DEFAULT_QUEUE_ID', '10');

-- 4. Indices for performance
CREATE INDEX idx_tickets_workflow ON tickets (workflow_processed);
CREATE INDEX idx_rules_priority ON workflow_rules (priority);

SELECT 'v20 Enterprise Automation Schema applied successfully!' AS migration_result;
