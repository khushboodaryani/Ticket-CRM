-- backend/src/db/migrations/v22_conversation_attachments.sql
USE ticket_crm;

CREATE TABLE IF NOT EXISTS conversation_message_attachments (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id    INT UNSIGNED NOT NULL,
  tenant_id     INT UNSIGNED NOT NULL DEFAULT 1,
  original_name VARCHAR(255) NOT NULL,
  storage_path  VARCHAR(500) NOT NULL,
  file_type     VARCHAR(100) NOT NULL,
  file_size     INT UNSIGNED NOT NULL,
  uploaded_by   INT UNSIGNED NULL, -- NULL if uploaded by customer via email
  visibility    ENUM('private','internal','public') DEFAULT 'public',
  is_deleted    TINYINT(1)   NOT NULL DEFAULT 0,
  deleted_at    DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_message_id (message_id),
  INDEX idx_uploaded_by (uploaded_by),
  INDEX idx_tenant_deleted (tenant_id, is_deleted),
  CONSTRAINT fk_cma_message FOREIGN KEY (message_id) REFERENCES conversation_messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_cma_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;