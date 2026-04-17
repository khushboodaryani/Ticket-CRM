-- ============================================================
-- Ticket CRM – v18 SaaS Queue & Derived SLA Logic
-- ============================================================

USE ticket_crm;

-- 1. Enhance Queues Table
ALTER TABLE queues 
  ADD COLUMN type ENUM('push', 'pull') NOT NULL DEFAULT 'pull' AFTER name;

-- 2. Create Queue SLA Modifiers Table
-- Allows specific queues to tighten the base SLA contract.
CREATE TABLE IF NOT EXISTS queue_sla_modifiers (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  queue_id              INT UNSIGNED NOT NULL,
  response_multiplier   DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  escalation_multiplier DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  stricter_only         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_queue_mod (queue_id),
  CONSTRAINT fk_qsm_queue FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Create Ticket Queue Logs Table
-- Audit trail for queue transitions.
CREATE TABLE IF NOT EXISTS ticket_queue_logs (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id     INT UNSIGNED NOT NULL,
  from_queue_id INT UNSIGNED NULL,
  to_queue_id   INT UNSIGNED NOT NULL,
  changed_by    INT UNSIGNED NULL,
  changed_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tql_ticket      FOREIGN KEY (ticket_id)     REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_tql_from_queue  FOREIGN KEY (from_queue_id) REFERENCES queues(id)  ON DELETE SET NULL,
  CONSTRAINT fk_tql_to_queue    FOREIGN KEY (to_queue_id)   REFERENCES queues(id)  ON DELETE CASCADE,
  CONSTRAINT fk_tql_user        FOREIGN KEY (changed_by)    REFERENCES users(id)   ON DELETE SET NULL,
  INDEX idx_ticket_change (ticket_id, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Extend Customer Domains for Ingestion Routing
ALTER TABLE customer_domains
  ADD COLUMN queue_id INT UNSIGNED NULL AFTER project_id,
  ADD CONSTRAINT fk_cd_queue FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE SET NULL;

-- 5. Add SLA fields to Customers and Projects for Tiered Resolution
ALTER TABLE customers
  ADD COLUMN resolution_time_hours INT UNSIGNED NULL AFTER default_project_id,
  ADD COLUMN response_time_sec     INT UNSIGNED NULL AFTER resolution_time_hours;

ALTER TABLE projects
  ADD COLUMN resolution_time_hours INT UNSIGNED NULL AFTER description,
  ADD COLUMN response_time_sec     INT UNSIGNED NULL AFTER resolution_time_hours;

-- 6. Summary
SELECT 'v18 Migration complete! Queues enhanced, SLA modifiers added, and tiered resolution fields initialized.' AS migration_result;
