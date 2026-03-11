-- ============================================================
-- Ticket CRM – v2 Blueprint Features Migration
-- MySQL 8.0 Compatible | Run ONCE on top of existing schema.sql
-- ============================================================

USE ticket_crm;

-- ============================================================
-- 1. NEW TABLE: queues
-- ============================================================
CREATE TABLE IF NOT EXISTS queues (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(150)   NOT NULL UNIQUE,
  priority     TINYINT        NOT NULL DEFAULT 3,
  sla_hours    DECIMAL(5,2)   NOT NULL DEFAULT 24.00,
  description  TEXT           NULL,
  created_by   INT UNSIGNED   NULL,
  created_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_queue_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 2. NEW TABLE: queue_agents
-- ============================================================
CREATE TABLE IF NOT EXISTS queue_agents (
  queue_id INT UNSIGNED NOT NULL,
  user_id  INT UNSIGNED NOT NULL,
  role     ENUM('agent','supervisor') NOT NULL DEFAULT 'agent',
  PRIMARY KEY (queue_id, user_id),
  CONSTRAINT fk_qa_queue FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE,
  CONSTRAINT fk_qa_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 3. ALTER tickets: add queue_id (skip if already exists)
-- ============================================================
DROP PROCEDURE IF EXISTS add_queue_id_column;
DELIMITER //
CREATE PROCEDURE add_queue_id_column()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tickets'
      AND COLUMN_NAME = 'queue_id'
  ) THEN
    ALTER TABLE tickets ADD COLUMN queue_id INT UNSIGNED NULL AFTER project_id;
  END IF;
END//
DELIMITER ;
CALL add_queue_id_column();
DROP PROCEDURE IF EXISTS add_queue_id_column;

-- ============================================================
-- 4. ALTER tickets: add sla_state (skip if already exists)
-- ============================================================
DROP PROCEDURE IF EXISTS add_sla_state_column;
DELIMITER //
CREATE PROCEDURE add_sla_state_column()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tickets'
      AND COLUMN_NAME = 'sla_state'
  ) THEN
    ALTER TABLE tickets ADD COLUMN sla_state ENUM('active','breached','completed') NOT NULL DEFAULT 'active' AFTER sla_paused_at;
  END IF;
END//
DELIMITER ;
CALL add_sla_state_column();
DROP PROCEDURE IF EXISTS add_sla_state_column;

-- ============================================================
-- 5. Add FK for queue_id (skip if already exists)
-- ============================================================
DROP PROCEDURE IF EXISTS add_queue_fk;
DELIMITER //
CREATE PROCEDURE add_queue_fk()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tickets'
      AND CONSTRAINT_NAME = 'fk_tickets_queue'
  ) THEN
    ALTER TABLE tickets ADD CONSTRAINT fk_tickets_queue FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE SET NULL;
  END IF;
END//
DELIMITER ;
CALL add_queue_fk();
DROP PROCEDURE IF EXISTS add_queue_fk;

-- Seed sla_state for existing tickets
UPDATE tickets SET sla_state = 'completed' WHERE status IN ('resolved','closed') AND sla_state = 'active';

-- ============================================================
-- 6. NEW TABLE: conversations
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id            INT UNSIGNED NOT NULL,
  source_channel       ENUM('email','voice','chat','whatsapp','manual','csv') NOT NULL DEFAULT 'manual',
  source_thread_id     VARCHAR(255)  NULL,
  participant_identity VARCHAR(255)  NULL,
  created_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_conv_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  INDEX idx_conv_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 7. NEW TABLE: conversation_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_messages (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id  INT UNSIGNED NOT NULL,
  sender_id        INT UNSIGNED NULL,
  sender_type      ENUM('agent','customer','system') NOT NULL DEFAULT 'agent',
  message_body     TEXT         NOT NULL,
  attachment_url   VARCHAR(500) NULL,
  is_internal_note TINYINT(1)   NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_msg_conv   FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id)       REFERENCES users(id)          ON DELETE SET NULL,
  INDEX idx_msg_conv (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 8. NEW TABLE: ticket_tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_tasks (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id   INT UNSIGNED NOT NULL,
  title       VARCHAR(255) NOT NULL,
  assigned_to INT UNSIGNED NULL,
  due_date    DATETIME     NULL,
  is_done     TINYINT(1)   NOT NULL DEFAULT 0,
  created_by  INT UNSIGNED NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_task_ticket  FOREIGN KEY (ticket_id)   REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_user    FOREIGN KEY (assigned_to) REFERENCES users(id)   ON DELETE SET NULL,
  CONSTRAINT fk_task_creator FOREIGN KEY (created_by)  REFERENCES users(id)   ON DELETE CASCADE,
  INDEX idx_task_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 9. NEW TABLE: in_app_notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED  NOT NULL,
  type       VARCHAR(50)   NOT NULL,
  title      VARCHAR(255)  NOT NULL,
  body       TEXT          NULL,
  entity_id  INT UNSIGNED  NULL,
  is_read    TINYINT(1)    NOT NULL DEFAULT 0,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user_read (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 10. Extend ticket_activities action column to VARCHAR
-- ============================================================
DROP PROCEDURE IF EXISTS fix_activities_action;
DELIMITER //
CREATE PROCEDURE fix_activities_action()
BEGIN
  DECLARE col_type VARCHAR(100);
  SELECT COLUMN_TYPE INTO col_type
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ticket_activities'
    AND COLUMN_NAME = 'action'
  LIMIT 1;
  IF col_type != 'varchar(50)' THEN
    ALTER TABLE ticket_activities MODIFY COLUMN action VARCHAR(50) NOT NULL;
  END IF;
END//
DELIMITER ;
CALL fix_activities_action();
DROP PROCEDURE IF EXISTS fix_activities_action;

SELECT 'v2 Migration complete! Tables created: queues, queue_agents, conversations, conversation_messages, ticket_tasks, in_app_notifications. Columns added: tickets.queue_id, tickets.sla_state.' AS migration_result;
