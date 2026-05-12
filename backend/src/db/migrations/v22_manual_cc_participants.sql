-- Adds manual CC metadata without changing inbound CC capture.

SET @has_added_manually := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'conversation_participants'
    AND COLUMN_NAME = 'added_manually'
);

SET @sql := IF(
  @has_added_manually = 0,
  'ALTER TABLE conversation_participants ADD COLUMN added_manually TINYINT(1) NOT NULL DEFAULT 0 AFTER type',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_notified_at := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'conversation_participants'
    AND COLUMN_NAME = 'notified_at'
);

SET @sql := IF(
  @has_notified_at = 0,
  'ALTER TABLE conversation_participants ADD COLUMN notified_at DATETIME NULL AFTER added_manually',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
