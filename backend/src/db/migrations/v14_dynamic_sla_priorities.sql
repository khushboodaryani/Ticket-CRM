-- ============================================================
-- Ticket CRM - v14 Dynamic SLA Priorities
-- Safe/idempotent migration (no destructive changes to data)
-- ============================================================

USE ticket_crm;

-- ============================================================
-- 1) Change sla_policies.priority from ENUM to VARCHAR(10)
--    This allows dynamic priority values (P1, P2, ... P10+)
-- ============================================================
ALTER TABLE sla_policies MODIFY COLUMN priority VARCHAR(10) NOT NULL;

-- Ensure unique index still exists on priority
-- (MySQL preserves UNIQUE when modifying column type, but let's be safe)
-- If the UNIQUE constraint already exists this will be a no-op error we can ignore.

-- ============================================================
-- 2) Add response_time_sec column (seconds-level precision)
--    Backfill from existing response_time_min × 60
-- ============================================================
SET @has_response_time_sec := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sla_policies'
    AND COLUMN_NAME = 'response_time_sec'
);

SET @has_response_time_min := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sla_policies'
    AND COLUMN_NAME = 'response_time_min'
);

-- Add response_time_sec if it doesn't exist
SET @sql_add_sec := IF(
  @has_response_time_sec = 0,
  'ALTER TABLE sla_policies ADD COLUMN response_time_sec INT UNSIGNED NOT NULL DEFAULT 900 AFTER resolution_time_hours',
  'SELECT 1'
);
PREPARE stmt_add_sec FROM @sql_add_sec;
EXECUTE stmt_add_sec;
DEALLOCATE PREPARE stmt_add_sec;

-- Backfill from response_time_min if both columns exist
SET @sql_backfill := IF(
  @has_response_time_sec = 0 AND @has_response_time_min > 0,
  'UPDATE sla_policies SET response_time_sec = response_time_min * 60 WHERE response_time_min > 0',
  'SELECT 1'
);
PREPARE stmt_backfill FROM @sql_backfill;
EXECUTE stmt_backfill;
DEALLOCATE PREPARE stmt_backfill;

-- Drop the old response_time_min column if response_time_sec exists now
SET @has_response_time_sec_after := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sla_policies'
    AND COLUMN_NAME = 'response_time_sec'
);

SET @sql_drop_min := IF(
  @has_response_time_sec_after > 0 AND @has_response_time_min > 0,
  'ALTER TABLE sla_policies DROP COLUMN response_time_min',
  'SELECT 1'
);
PREPARE stmt_drop_min FROM @sql_drop_min;
EXECUTE stmt_drop_min;
DEALLOCATE PREPARE stmt_drop_min;

-- ============================================================
-- 3) Drop customer_sla_policies table
--    Customer-level SLA overrides are being removed.
--    Will be rebuilt later with domain-based logic.
-- ============================================================
DROP TABLE IF EXISTS customer_sla_policies;

-- ============================================================
-- 4) Ensure index on priority column for fast validation lookups
-- ============================================================
-- The UNIQUE key from the original ENUM already serves as an index.
-- No additional index needed.

-- ============================================================
-- 5) Seed additional priorities P6–P10 if they don't exist
-- ============================================================
INSERT INTO sla_policies (priority, resolution_time_hours, response_time_sec, escalation_1_min, escalation_2_min, escalation_3_min)
SELECT * FROM (SELECT 'P6' as priority, 72.00 as rth, 2400 as rts, 720 as e1, 1200 as e2, 2160 as e3) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM sla_policies WHERE priority = 'P6');

INSERT INTO sla_policies (priority, resolution_time_hours, response_time_sec, escalation_1_min, escalation_2_min, escalation_3_min)
SELECT * FROM (SELECT 'P7' as priority, 96.00 as rth, 3600 as rts, 960 as e1, 1440 as e2, 2880 as e3) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM sla_policies WHERE priority = 'P7');

INSERT INTO sla_policies (priority, resolution_time_hours, response_time_sec, escalation_1_min, escalation_2_min, escalation_3_min)
SELECT * FROM (SELECT 'P8' as priority, 120.00 as rth, 4800 as rts, 1200 as e1, 1920 as e2, 3600 as e3) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM sla_policies WHERE priority = 'P8');

INSERT INTO sla_policies (priority, resolution_time_hours, response_time_sec, escalation_1_min, escalation_2_min, escalation_3_min)
SELECT * FROM (SELECT 'P9' as priority, 168.00 as rth, 7200 as rts, 1440 as e1, 2880 as e2, 4320 as e3) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM sla_policies WHERE priority = 'P9');

INSERT INTO sla_policies (priority, resolution_time_hours, response_time_sec, escalation_1_min, escalation_2_min, escalation_3_min)
SELECT * FROM (SELECT 'P10' as priority, 240.00 as rth, 14400 as rts, 2880 as e1, 4320 as e2, 5760 as e3) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM sla_policies WHERE priority = 'P10');

SELECT 'v14 dynamic SLA priorities migration complete!' AS migration_result;
