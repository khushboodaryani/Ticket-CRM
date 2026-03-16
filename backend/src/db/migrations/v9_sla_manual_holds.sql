-- ============================================================
-- Ticket CRM – v9 SLA Manual Holds Migration
-- ============================================================

USE ticket_crm;

DROP PROCEDURE IF EXISTS add_manual_hold_columns;
DELIMITER //
CREATE PROCEDURE add_manual_hold_columns()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tickets'
      AND COLUMN_NAME = 'sla_paused_manual'
  ) THEN
    ALTER TABLE tickets 
      ADD COLUMN sla_paused_manual TINYINT(1) NOT NULL DEFAULT 0 AFTER sla_paused,
      ADD COLUMN sla_pause_reason  VARCHAR(255) NULL AFTER sla_paused_manual;
  END IF;
END//
DELIMITER ;
CALL add_manual_hold_columns();
DROP PROCEDURE IF EXISTS add_manual_hold_columns;

SELECT 'v9 Manual Holds Columns verified/added' AS migration_result;
