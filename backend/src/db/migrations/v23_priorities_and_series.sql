-- backend/src/db/migrations/v23_priorities_and_series.sql
USE ticket_crm;

-- 1. Create Priorities Table
CREATE TABLE IF NOT EXISTS priorities (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(50)  NOT NULL UNIQUE,
  series_prefix CHAR(1)      NOT NULL UNIQUE,
  `rank`          TINYINT      NOT NULL DEFAULT 0,
  color_code    VARCHAR(7)   DEFAULT '#64748b', -- Hex code
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Create Sequence Table for Ticket IDs
CREATE TABLE IF NOT EXISTS priority_sequences (
  series_prefix CHAR(1) PRIMARY KEY,
  last_seq      INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Seed Metadata
INSERT IGNORE INTO priorities (name, series_prefix, `rank`, color_code) VALUES
('Critical', 'P', 1, '#ef4444'),
('High',     'Q', 2, '#f97316'),
('Medium',   'R', 3, '#3b82f6'),
('Low',      'S', 4, '#10b981'),
('Tier 5',   'T', 5, '#64748b');

INSERT IGNORE INTO priority_sequences (series_prefix, last_seq) VALUES
('P', 0), ('Q', 0), ('R', 0), ('S', 0), ('T', 0);

-- 4. Augment Tickets Table for Enterprise SLA 2.1
ALTER TABLE tickets 
  ADD COLUMN priority_id INT UNSIGNED NULL AFTER priority,
  ADD COLUMN legacy_priority_raw VARCHAR(10) NULL AFTER priority_id,
  ADD COLUMN resolved_timezone VARCHAR(64) DEFAULT 'Asia/Kolkata' AFTER etr,
  ADD COLUMN cumulative_pause_minutes INT UNSIGNED DEFAULT 0 AFTER resolved_timezone,
  ADD COLUMN is_first_response_met TINYINT(1) DEFAULT 0 AFTER cumulative_pause_minutes,
  ADD COLUMN sla_policy_id INT UNSIGNED NULL,
  ADD COLUMN sla_version INT UNSIGNED DEFAULT 1,
  ADD CONSTRAINT fk_tickets_priority FOREIGN KEY (priority_id) REFERENCES priorities(id);

-- 5. Data Migration: P1->P, P2->Q, P3->R, P4->S, P5->T
-- Store the original enum value for safety
UPDATE tickets SET legacy_priority_raw = priority;

-- Perform the mapping
UPDATE tickets t 
JOIN priorities p ON p.series_prefix = 'P' 
SET t.priority_id = p.id 
WHERE t.priority = 'P1';

UPDATE tickets t 
JOIN priorities p ON p.series_prefix = 'Q' 
SET t.priority_id = p.id 
WHERE t.priority = 'P2';

UPDATE tickets t 
JOIN priorities p ON p.series_prefix = 'R' 
SET t.priority_id = p.id 
WHERE t.priority = 'P3';

UPDATE tickets t 
JOIN priorities p ON p.series_prefix = 'S' 
SET t.priority_id = p.id 
WHERE t.priority = 'P4';

UPDATE tickets t 
JOIN priorities p ON p.series_prefix = 'T' 
SET t.priority_id = p.id 
WHERE t.priority = 'P5';

-- Add Index for frozen timezone lookups
CREATE INDEX idx_resolved_timezone ON tickets(resolved_timezone);
