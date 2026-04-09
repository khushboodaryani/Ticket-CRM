-- backend/src/db/migrations/v11_production_email_refactor.sql

-- 1. Enhance Tickets Table
ALTER TABLE tickets 
ADD COLUMN subject VARCHAR(500) AFTER ticket_number;

-- 2. Enhance Conversations Table
ALTER TABLE conversations 
ADD COLUMN root_message_id VARCHAR(255) AFTER source_channel,
ADD COLUMN customer_id INT UNSIGNED AFTER root_message_id;

-- Add uniqueness to root_message_id
CREATE UNIQUE INDEX unique_root_message ON conversations(root_message_id);

-- Add Customer FK
ALTER TABLE conversations
ADD CONSTRAINT fk_conversation_customer 
FOREIGN KEY (customer_id) REFERENCES customers(id)
ON DELETE SET NULL;

-- 3. Enhance Messages Table for Threading
ALTER TABLE conversation_messages 
ADD COLUMN message_id VARCHAR(255) AFTER conversation_id,
ADD COLUMN in_reply_to VARCHAR(255) AFTER message_id,
ADD COLUMN reference_chain TEXT AFTER in_reply_to;

-- Add unique index for message_id (Strict Threading)
CREATE UNIQUE INDEX unique_message_id ON conversation_messages(message_id);

-- 4. Create Relational Participant Model
CREATE TABLE IF NOT EXISTS conversation_participants (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT UNSIGNED NOT NULL,
  email VARCHAR(255) NOT NULL,
  type ENUM('to', 'cc', 'bcc') NOT NULL DEFAULT 'cc',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_participant (conversation_id, email),
  INDEX idx_email (email),
  INDEX idx_conv_participant (conversation_id),
  CONSTRAINT fk_participant_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Create Email Audit Log with Retry Support
CREATE TABLE IF NOT EXISTS email_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id VARCHAR(255),
  sender_email VARCHAR(255),
  subject VARCHAR(500),
  status ENUM('processed', 'failed', 'retry_pending') NOT NULL DEFAULT 'processed',
  error_message TEXT,
  retry_count INT DEFAULT 0,
  last_attempt_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_msg_id (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Additional Critical Indexes for Performance
CREATE INDEX idx_irt ON conversation_messages(in_reply_to);
CREATE INDEX idx_conv_id ON conversation_messages(conversation_id);
