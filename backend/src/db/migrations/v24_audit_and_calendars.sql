-- backend/src/db/migrations/v24_audit_and_calendars.sql
USE ticket_crm;

-- 1. Calendars and Business Hours
CREATE TABLE IF NOT EXISTS sla_calendars (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  timezone      VARCHAR(64)  NOT NULL DEFAULT 'Asia/Kolkata',
  is_default    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sla_business_hours (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  calendar_id   INT UNSIGNED NOT NULL,
  day_of_week   ENUM('Mon','Tue','Wed','Thu','Fri','Sat','Sun') NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  CONSTRAINT fk_bh_calendar FOREIGN KEY (calendar_id) REFERENCES sla_calendars(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sla_holidays (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  calendar_id   INT UNSIGNED NOT NULL,
  holiday_date  DATE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  CONSTRAINT fk_hol_calendar FOREIGN KEY (calendar_id) REFERENCES sla_calendars(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Audit Logs (Partition-ready)
CREATE TABLE IF NOT EXISTS routing_execution_logs (
  id            BIGINT UNSIGNED AUTO_INCREMENT,
  ticket_id     INT UNSIGNED NOT NULL,
  rule_id       INT UNSIGNED NULL,
  rule_name     VARCHAR(255) NULL,
  action_taken  VARCHAR(50)  NOT NULL,
  input_data    JSON         NULL,
  output_data   JSON         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, created_at) -- Required for partitioning
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Note: Partitioning (PARTITION BY RANGE) can be added here if needed for high volume

CREATE TABLE IF NOT EXISTS sla_event_logs (
  id            BIGINT UNSIGNED AUTO_INCREMENT,
  ticket_id     INT UNSIGNED NOT NULL,
  event_type    ENUM('creation', 'pause', 'resume', 'breach', 'first_response') NOT NULL,
  old_etr       DATETIME     NULL,
  new_etr       DATETIME     NULL,
  pause_duration_min INT UNSIGNED DEFAULT 0,
  note          TEXT         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Refactor SLA Policies Table
-- Rename/Modify existing if it exists, otherwise create
CREATE TABLE IF NOT EXISTS sla_policies_new (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(100) NOT NULL,
  customer_id         INT UNSIGNED NULL,
  project_id          INT UNSIGNED NULL,
  priority_id         INT UNSIGNED NOT NULL,
  first_response_hrs  DECIMAL(5,2) NOT NULL DEFAULT 1.0,
  resolution_hrs      DECIMAL(5,2) NOT NULL DEFAULT 4.0,
  version             INT UNSIGNED NOT NULL DEFAULT 1,
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sla_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_sla_project  FOREIGN KEY (project_id)  REFERENCES projects(id)  ON DELETE CASCADE,
  CONSTRAINT fk_sla_priority FOREIGN KEY (priority_id) REFERENCES priorities(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed a Default Calendar
INSERT IGNORE INTO sla_calendars (name, timezone, is_default) VALUES ('Standard Business Hours', 'Asia/Kolkata', 1);

-- Seed Business Hours (9 AM - 6 PM Mon-Fri)
SET @cal_id = (SELECT id FROM sla_calendars WHERE is_default = 1 LIMIT 1);
INSERT IGNORE INTO sla_business_hours (calendar_id, day_of_week, start_time, end_time) VALUES
(@cal_id, 'Mon', '09:00:00', '18:00:00'),
(@cal_id, 'Tue', '09:00:00', '18:00:00'),
(@cal_id, 'Wed', '09:00:00', '18:00:00'),
(@cal_id, 'Thu', '09:00:00', '18:00:00'),
(@cal_id, 'Fri', '09:00:00', '18:00:00');
