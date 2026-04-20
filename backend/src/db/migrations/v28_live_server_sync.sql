-- backend/src/db/migrations/v28_live_server_sync.sql
-- ---------------------------------------------------------
-- MANUAL RECORD: Fixes applied to Live Server (181.214.10.244)
-- Date: 2026-04-20
-- Purpose: Harmonize live DB with local schema and fix 500 errors.
-- ---------------------------------------------------------

USE ticket_crm;

-- 1. SCHEMA CLEANUP
ALTER TABLE priorities 
  DROP COLUMN IF EXISTS series_prefix,
  DROP COLUMN IF EXISTS rank;

ALTER TABLE priorities DROP INDEX IF EXISTS name;

-- 2. DATA RENAMING (P1, Q1, R1, S1 PARITY)
UPDATE priorities SET name = 'P1' WHERE category_id = 1 AND level = 1;
UPDATE priorities SET name = 'Q1' WHERE category_id = 2 AND level = 1;
UPDATE priorities SET name = 'R1' WHERE category_id = 3 AND level = 1;
UPDATE priorities SET name = 'S1' WHERE category_id = 4 AND level = 1;

-- 3. DATA INTEGRITY (MISSING SLA POLICIES)
INSERT INTO sla_policies_new (
  name, priority_id, first_response_hrs, resolution_hrs, 
  escalation_1_min, escalation_2_min, escalation_3_min
)
SELECT 
    CONCAT('Global Default - ', name), 
    id, 
    1.0, 
    4.0, 
    60,  
    120, 
    180  
FROM priorities p
WHERE NOT EXISTS (
    SELECT 1 FROM sla_policies_new sp WHERE sp.priority_id = p.id
);

-- 4. SEQUENCE INITIALIZATION
INSERT IGNORE INTO priority_sequences (category_id, last_seq)
SELECT id, 0 FROM sla_priority_categories;
