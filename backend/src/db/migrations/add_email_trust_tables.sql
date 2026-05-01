CREATE TABLE IF NOT EXISTS system_sent_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id VARCHAR(500) NOT NULL,
  ticket_id INT UNSIGNED NULL,
  sent_at DATETIME NOT NULL DEFAULT NOW(),
  UNIQUE KEY uq_message_id (message_id),
  INDEX idx_sent_at (sent_at)
);

CREATE TABLE IF NOT EXISTS security_audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  sender_email VARCHAR(255),
  ticket_number VARCHAR(50),
  message_id VARCHAR(500),
  details TEXT,
  created_at DATETIME NOT NULL DEFAULT NOW(),
  INDEX idx_event_type (event_type),
  INDEX idx_created_at (created_at)
);
