-- v26_category_tier_cleanup.sql

-- 1. Ensure priorities UNIQUE index is strictly there (idempotent)
-- (We already saw it was there from describe, so we can skip or use IF NOT EXISTS logic)

-- 2. Migrate priority sequences with COLLATION FIX
CREATE TABLE IF NOT EXISTS priority_sequences_new (
    category_id INT UNSIGNED PRIMARY KEY,
    last_seq INT UNSIGNED NOT NULL DEFAULT 0,
    FOREIGN KEY (category_id) REFERENCES sla_priority_categories(id)
) ENGINE=InnoDB;

-- Import existing sequences by mapping prefix to category_id
-- We force collation on the join to avoid "Illegal mix of collations"
INSERT IGNORE INTO priority_sequences_new (category_id, last_seq)
SELECT c.id, s.last_seq
FROM priority_sequences s
JOIN sla_priority_categories c ON s.series_prefix COLLATE utf8mb4_unicode_ci = c.prefix COLLATE utf8mb4_unicode_ci;

-- 3. Swap the tables
DROP TABLE IF EXISTS priority_sequences_old;
RENAME TABLE priority_sequences TO priority_sequences_old, priority_sequences_new TO priority_sequences;
DROP TABLE IF EXISTS priority_sequences_old;

-- 4. Removed indexes to prevent IF NOT EXISTS syntax collision on some MySQL versions
