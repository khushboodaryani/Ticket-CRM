-- ============================================================
-- Ticket CRM – v10 Email Threading Improvements
-- Adds cc_emails column to conversations for proper CC tracking
-- ============================================================

USE ticket_crm;

DROP PROCEDURE IF EXISTS add_cc_emails_column;
DELIMITER //
CREATE PROCEDURE add_cc_emails_column()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'conversations'
      AND COLUMN_NAME = 'cc_emails'
  ) THEN
    ALTER TABLE conversations ADD COLUMN cc_emails TEXT NULL COMMENT 'Comma-separated list of CC email addresses from inbound email';
  END IF;
END//
DELIMITER ;
CALL add_cc_emails_column();
DROP PROCEDURE IF EXISTS add_cc_emails_column;

-- Add index on participant_identity for faster threading lookups
DROP PROCEDURE IF EXISTS add_conv_participant_index;
DELIMITER //
CREATE PROCEDURE add_conv_participant_index()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'conversations'
      AND INDEX_NAME = 'idx_conv_participant'
  ) THEN
    ALTER TABLE conversations ADD INDEX idx_conv_participant (participant_identity(100));
  END IF;
END//
DELIMITER ;
CALL add_conv_participant_index();
DROP PROCEDURE IF EXISTS add_conv_participant_index;

SELECT 'v10 Migration complete! Added cc_emails column to conversations.' AS migration_result;
