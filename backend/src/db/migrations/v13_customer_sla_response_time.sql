-- ============================================================
-- Ticket CRM - v13 Customer SLA Overrides + Response Time
-- Safe/idempotent migration (no destructive changes)
-- ============================================================

USE ticket_crm;

-- 1) Add response_time_min to global SLA policy table if missing
SET @has_response_time_min := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sla_policies'
    AND COLUMN_NAME = 'response_time_min'
);

SET @sql_response_time_min := IF(
  @has_response_time_min = 0,
  'ALTER TABLE sla_policies ADD COLUMN response_time_min INT UNSIGNED NOT NULL DEFAULT 15 AFTER resolution_time_hours',
  'SELECT 1'
);
PREPARE stmt_response_time_min FROM @sql_response_time_min;
EXECUTE stmt_response_time_min;
DEALLOCATE PREPARE stmt_response_time_min;

-- 2) Backfill sensible defaults if new column exists and has zeroes/null-like values
UPDATE sla_policies
SET response_time_min = CASE priority
    WHEN 'P1' THEN 5
    WHEN 'P2' THEN 15
    WHEN 'P3' THEN 30
    WHEN 'P4' THEN 60
    WHEN 'P5' THEN 120
    ELSE 15
END
WHERE response_time_min IS NULL OR response_time_min = 0;

-- 3) Create customer-level SLA override table (effective policy = customer override > global)
CREATE TABLE IF NOT EXISTS customer_sla_policies (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id           INT UNSIGNED NOT NULL,
  priority              ENUM('P1', 'P2', 'P3', 'P4', 'P5') NOT NULL,
  resolution_time_hours DECIMAL(5,2) NOT NULL DEFAULT 2.00,
  response_time_min     INT UNSIGNED NOT NULL DEFAULT 15,
  escalation_1_min      INT UNSIGNED NOT NULL DEFAULT 60,
  escalation_2_min      INT UNSIGNED NOT NULL DEFAULT 120,
  escalation_3_min      INT UNSIGNED NOT NULL DEFAULT 180,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_customer_priority (customer_id, priority),
  CONSTRAINT fk_csp_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT 'v13 customer SLA + response time migration complete!' AS migration_result;
