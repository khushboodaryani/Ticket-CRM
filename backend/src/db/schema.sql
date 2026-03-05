-- ============================================================
-- Ticket CRM – Complete Database Schema
-- DB: ticket_crm
-- Run this file ONCE to set up all tables
-- ============================================================

CREATE DATABASE IF NOT EXISTS ticket_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ticket_crm;

-- ============================================================
-- 1. USERS
-- Role hierarchy: superadmin > gm > manager > tl > agent
-- reporting_to links each user to their direct superior
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150)  NOT NULL,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  role          ENUM('superadmin','gm','manager','tl','agent') NOT NULL DEFAULT 'agent',
  reporting_to  INT UNSIGNED  NULL,
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_reporting FOREIGN KEY (reporting_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 2. CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(200)  NOT NULL,
  email         VARCHAR(255)  NULL,
  phone         VARCHAR(30)   NULL,
  customer_code VARCHAR(50)   NULL UNIQUE,
  address       TEXT          NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 3. PROJECTS
-- Each project belongs to one customer
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id  INT UNSIGNED  NOT NULL,
  name         VARCHAR(200)  NOT NULL,
  project_code VARCHAR(50)   NULL UNIQUE,
  description  TEXT          NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_projects_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 4. TICKETS
-- Core ticket table with SLA tracking fields
-- ============================================================
CREATE TABLE IF NOT EXISTS tickets (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_number    VARCHAR(30)   NOT NULL UNIQUE,             -- TKT-YYYYMMDD-XXXX
  customer_id      INT UNSIGNED  NOT NULL,
  project_id       INT UNSIGNED  NOT NULL,
  category         VARCHAR(100)  NOT NULL,
  priority         ENUM('P1','P2','P3','P4','P5') NOT NULL DEFAULT 'P3',
  description      TEXT          NOT NULL,
  attachment_url   VARCHAR(500)  NULL,
  status           ENUM('open','in_progress','pending','resolved','closed') NOT NULL DEFAULT 'open',
  escalation_level TINYINT       NOT NULL DEFAULT 1,           -- 1=Agent 2=TL 3=Manager 4=GM
  str              DATETIME      NULL,                         -- Start Time (when work actually started)
  etr              DATETIME      NULL,                         -- Expected Time to Resolve
  resolved_at      DATETIME      NULL,
  sla_paused       TINYINT(1)    NOT NULL DEFAULT 0,           -- 1 = SLA clock is paused
  sla_paused_at    DATETIME      NULL,                         -- Timestamp when SLA was paused
  source           ENUM('email','call','manual') NOT NULL DEFAULT 'manual',
  created_by       INT UNSIGNED  NOT NULL,
  assigned_to      INT UNSIGNED  NULL,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tickets_customer   FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_tickets_project    FOREIGN KEY (project_id)  REFERENCES projects(id),
  CONSTRAINT fk_tickets_created_by FOREIGN KEY (created_by)  REFERENCES users(id),
  CONSTRAINT fk_tickets_assigned   FOREIGN KEY (assigned_to)  REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_status            (status),
  INDEX idx_priority          (priority),
  INDEX idx_escalation_level  (escalation_level),
  INDEX idx_assigned_to       (assigned_to),
  INDEX idx_customer_project  (customer_id, project_id),
  INDEX idx_created_at        (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 5. ESCALATION LOGS
-- Every auto or manual escalation is recorded here
-- ============================================================
CREATE TABLE IF NOT EXISTS escalation_logs (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id        INT UNSIGNED  NOT NULL,
  from_user_id     INT UNSIGNED  NULL,
  to_user_id       INT UNSIGNED  NULL,
  escalation_level TINYINT       NOT NULL,
  reason           TEXT          NULL,
  escalated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_esc_ticket   FOREIGN KEY (ticket_id)    REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_esc_from     FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_esc_to       FOREIGN KEY (to_user_id)   REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_esc_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 6. TICKET ACTIVITIES (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_activities (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id    INT UNSIGNED  NOT NULL,
  action       VARCHAR(50)   NOT NULL, -- created, updated, escalated, auto_escalated, resolved
  performed_by INT UNSIGNED  NULL,     -- NULL = system (cron)
  note         TEXT          NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_act_ticket FOREIGN KEY (ticket_id)    REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_act_user   FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_act_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 7. SHIFTS
-- Shift configuration for SLA calculation
-- working_days stored as JSON array: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
-- ============================================================
CREATE TABLE IF NOT EXISTS shifts (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100)  NOT NULL,
  start_time   TIME          NOT NULL,       -- e.g. 09:00:00
  end_time     TIME          NOT NULL,       -- e.g. 18:00:00
  shift_type   ENUM('general','night','rotational') NOT NULL DEFAULT 'general',
  working_days JSON          NOT NULL,        -- ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
  created_by   INT UNSIGNED  NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shift_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 8. SHIFT MEMBERS
-- Maps users (agents/TLs) to shifts
-- ============================================================
CREATE TABLE IF NOT EXISTS shift_members (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shift_id  INT UNSIGNED NOT NULL,
  user_id   INT UNSIGNED NOT NULL,
  role      ENUM('agent','tl') NOT NULL DEFAULT 'agent',
  UNIQUE KEY uq_shift_user (shift_id, user_id),
  CONSTRAINT fk_sm_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
  CONSTRAINT fk_sm_user  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 9. HOLIDAYS
-- Dates on which SLA pauses for all tickets
-- ============================================================
CREATE TABLE IF NOT EXISTS holidays (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  holiday_date DATE         NOT NULL UNIQUE,
  description  VARCHAR(200) NULL,
  created_by   INT UNSIGNED NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_holiday_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_holiday_date (holiday_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- DEFAULT SUPER ADMIN SEED
-- Password: Admin@1234  (bcrypt hash below)
-- Change immediately after first login!
-- ============================================================
INSERT IGNORE INTO users (name, email, password_hash, role, reporting_to, is_active)
VALUES (
  'Super Admin',
  'admin@ticketcrm.com',
  '$2b$12$K8HZU3GePdlALSj7D5pNZebkNdGU1XaFSFBGIHi3LdA3OxlkJaxjW',
  'superadmin',
  NULL,
  1
);
