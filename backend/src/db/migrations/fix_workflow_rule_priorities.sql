-- Raise specific routing rules above the email catch-all.
UPDATE workflow_rules SET priority = 10 WHERE id IN (3, 4);
-- Lower the catch-all so it only fires when nothing else matches.
UPDATE workflow_rules SET priority = -1 WHERE id = 2;
-- Verify (read-only check, remove before prod run):
SELECT id, name, priority FROM workflow_rules ORDER BY priority DESC, id ASC;
