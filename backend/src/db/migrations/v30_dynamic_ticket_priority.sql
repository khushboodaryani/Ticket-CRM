-- v30_dynamic_ticket_priority.sql
-- Fixes the "Data truncated" error by allowing dynamic priorities (P1-P10, Q1-Q5, etc.) in the tickets table.

USE ticket_crm;

-- Change priority from ENUM to VARCHAR(20)
-- We use VARCHAR(20) to stay consistent with other dynamic fields and allow for longer custom priority names.
ALTER TABLE tickets MODIFY COLUMN priority VARCHAR(20) NOT NULL DEFAULT 'P3';

-- Update any existing rows (safety check, though ENUM values usually map fine to VARCHAR)
-- No action needed.

SELECT 'v30 dynamic ticket priority migration complete!' AS result;
