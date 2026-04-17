-- v26_category_tier_model.sql

-- 1. Create categories table
CREATE TABLE IF NOT EXISTS sla_priority_categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    prefix CHAR(1) NOT NULL UNIQUE,
    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Seed the 4 fixed categories
INSERT IGNORE INTO sla_priority_categories (id, name, prefix, sort_order) VALUES
(1, 'Critical', 'P', 1),
(2, 'High', 'Q', 2),
(3, 'Medium', 'R', 3),
(4, 'Low', 'S', 4);

-- 3. Modify priorities table
-- Add category_id and rename rank to level
ALTER TABLE priorities 
ADD COLUMN category_id INT UNSIGNED DEFAULT NULL,
ADD COLUMN `level` INT UNSIGNED DEFAULT 1,
ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1;

-- Map existing priorities to categories
UPDATE priorities SET category_id = 1, `level` = 1 WHERE id = 1; -- Critical
UPDATE priorities SET category_id = 2, `level` = 1 WHERE id = 2; -- High
UPDATE priorities SET category_id = 3, `level` = 1 WHERE id = 3; -- Medium
UPDATE priorities SET category_id = 4, `level` = 1 WHERE id = 4; -- Low
UPDATE priorities SET category_id = 4, `level` = 2, is_active = 0 WHERE id = 5; -- Tier 5 (Decommissioned/Soft-deleted)

-- 4. Constraint: category_id should be NOT NULL after mapping
ALTER TABLE priorities MODIFY category_id INT UNSIGNED NOT NULL;
ALTER TABLE priorities ADD CONSTRAINT fk_priorities_category FOREIGN KEY (category_id) REFERENCES sla_priority_categories(id);

-- 5. Data Integrity: UNIQUE(category_id, level)
-- We use rank (renamed to level) for this.
ALTER TABLE priorities ADD UNIQUE INDEX idx_category_level (category_id, `level`);

-- 6. Update priority_sequences to use category_id
-- We'll recreate it to have category_id as PK
CREATE TABLE IF NOT EXISTS priority_sequences_new (
    category_id INT UNSIGNED PRIMARY KEY,
    last_seq INT UNSIGNED NOT NULL DEFAULT 0,
    FOREIGN KEY (category_id) REFERENCES sla_priority_categories(id)
) ENGINE=InnoDB;

-- Import existing sequences by mapping prefix to category_id
INSERT INTO priority_sequences_new (category_id, last_seq)
SELECT c.id, s.last_seq
FROM priority_sequences s
JOIN sla_priority_categories c ON s.series_prefix = c.prefix;

DROP TABLE priority_sequences;
RENAME TABLE priority_sequences_new TO priority_sequences;

-- 7. Removed indexes referencing sla_policies_new to prevent crashes on live deployment.
