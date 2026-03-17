-- ============================================================
-- Ticket CRM – v8 SLA Policies Migration
-- ============================================================

USE ticket_crm;

CREATE TABLE sla_policies (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  priority             ENUM('P1', 'P2', 'P3', 'P4', 'P5') NOT NULL UNIQUE,
  resolution_time_hours DECIMAL(5,2) NOT NULL DEFAULT 2.00,
  escalation_1_min     INT UNSIGNED NOT NULL DEFAULT 60 COMMENT 'Threshold for Auto-escalation to Level 2',
  escalation_2_min     INT UNSIGNED NOT NULL DEFAULT 90 COMMENT 'Threshold for Auto-escalation to Level 3',
  escalation_3_min     INT UNSIGNED NOT NULL DEFAULT 120 COMMENT 'Threshold for Auto-escalation to Level 4',
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default values if not exists
INSERT INTO sla_policies (priority, resolution_time_hours, escalation_1_min, escalation_2_min, escalation_3_min) VALUES
('P1', 2.00, 30, 60, 90),
('P2', 4.00, 60, 120, 180),
('P3', 8.00, 120, 240, 360),
('P4', 24.00, 240, 480, 720),
('P5', 48.00, 480, 960, 1440)
ON DUPLICATE KEY UPDATE updated_at=NOW();

SELECT 'v8 SLA policies migration complete!' AS migration_result;
