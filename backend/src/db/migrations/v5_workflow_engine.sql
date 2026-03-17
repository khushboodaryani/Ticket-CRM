-- ============================================================
-- Ticket CRM – v5 Workflow Automation Engine Schema
-- Generic Trigger → Condition → Action (TCA) System
-- ============================================================

USE ticket_crm;

-- 1. Table: workflow_rules
-- Stores the blueprint of automation rules
CREATE TABLE  workflow_rules (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  description  TEXT         NULL,
  
  -- Trigger: e.g. 'ticket_created', 'ticket_status_changed', 'sla_breached'
  trigger_event VARCHAR(50) NOT NULL,
  
  -- Condition: JSON blob defining criteria
  -- e.g. {"priority": ["P1", "P2"], "category": ["Urgent"]}
  conditions    JSON         NULL,
  
  -- Actions: JSON array of actions to perform
  -- e.g. [{"type": "assign_to", "value": 5}, {"type": "send_email", "template": "alert"}]
  actions       JSON         NOT NULL,
  
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_by    INT UNSIGNED NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_wf_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_trigger (trigger_event),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Table: workflow_runs
-- Audit log for every time a workflow is executed
CREATE TABLE  workflow_runs (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rule_id      INT UNSIGNED NOT NULL,
  ticket_id    INT UNSIGNED NOT NULL,
  
  -- Status: 'success', 'failed', 'condition_not_met'
  status       ENUM('success', 'failed', 'skipped') NOT NULL,
  
  -- Logs: Details of what happened
  run_log      TEXT         NULL,
  
  executed_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_run_rule   FOREIGN KEY (rule_id)   REFERENCES workflow_rules(id) ON DELETE CASCADE,
  CONSTRAINT fk_run_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id)        ON DELETE CASCADE,
  INDEX idx_run_ticket (ticket_id),
  INDEX idx_run_rule (rule_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT 'v5 Workflow Engine Schema applied successfully!' AS migration_result;
