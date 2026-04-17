-- ============================================================
-- Ticket CRM – v15 Domain-Based Customer Routing
-- Adds domain-level routing for email→ticket creation,
-- approval workflow for unknown domains, and held emails.
-- ============================================================

USE ticket_crm;

-- ============================================================
-- 1. customer_domains — maps email domains to customers/projects
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_domains (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id  INT UNSIGNED  NOT NULL,
  project_id   INT UNSIGNED  NULL,          -- NULL = customer root, SET = route to specific project
  domain       VARCHAR(255)  NOT NULL,       -- e.g. 'multycomm.com', 'shams.multycomm.com'
  is_active    TINYINT(1)    NOT NULL DEFAULT 1,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_domain (domain),
  INDEX idx_customer (customer_id),
  INDEX idx_project (project_id),
  INDEX idx_domain_active (domain, is_active),
  CONSTRAINT fk_cd_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_cd_project  FOREIGN KEY (project_id)  REFERENCES projects(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
-- 2. domain_approval_requests — pending approvals for unknown domains
-- ============================================================
CREATE TABLE IF NOT EXISTS domain_approval_requests (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  domain                VARCHAR(255)  NOT NULL,
  sender_email          VARCHAR(255)  NOT NULL,
  sender_name           VARCHAR(200)  NULL,
  email_subject         VARCHAR(500)  NULL,
  email_body            TEXT          NULL,
  message_id            VARCHAR(255)  NULL,       -- IMAP message ID for reference
  status                ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  approved_customer_id  INT UNSIGNED  NULL,
  approved_project_id   INT UNSIGNED  NULL,
  reviewed_by           INT UNSIGNED  NULL,
  reviewed_at           DATETIME      NULL,
  created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_domain_status (domain, status),
  INDEX idx_status (status),
  CONSTRAINT fk_dar_customer FOREIGN KEY (approved_customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_dar_project  FOREIGN KEY (approved_project_id)  REFERENCES projects(id)  ON DELETE SET NULL,
  CONSTRAINT fk_dar_reviewer FOREIGN KEY (reviewed_by)          REFERENCES users(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
-- 3. held_emails — child table: emails held pending domain approval
--    Multiple emails can arrive from a domain before the superadmin
--    reviews. One approval decision releases all of them.
-- ============================================================
CREATE TABLE IF NOT EXISTS held_emails (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  approval_request_id   INT UNSIGNED  NOT NULL,
  sender_email          VARCHAR(255)  NOT NULL,
  sender_name           VARCHAR(200)  NULL,
  subject               VARCHAR(500)  NULL,
  body                  TEXT          NULL,
  message_id            VARCHAR(255)  NULL,
  in_reply_to           VARCHAR(255)  NULL,
  reference_chain       TEXT          NULL,
  received_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at          DATETIME      NULL,      -- set when ticket is auto-created from this held email
  INDEX idx_approval (approval_request_id),
  INDEX idx_processed (processed_at),
  CONSTRAINT fk_he_approval FOREIGN KEY (approval_request_id) REFERENCES domain_approval_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================
-- 4. Add default_project_id to customers table
-- ============================================================
DROP PROCEDURE IF EXISTS add_default_project_id;
DELIMITER //
CREATE PROCEDURE add_default_project_id()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'customers'
      AND COLUMN_NAME = 'default_project_id'
  ) THEN
    ALTER TABLE customers 
      ADD COLUMN default_project_id INT UNSIGNED NULL AFTER address;
  END IF;
END//
DELIMITER ;
CALL add_default_project_id();
DROP PROCEDURE IF EXISTS add_default_project_id;

-- Add FK for default_project_id (skip if exists)
DROP PROCEDURE IF EXISTS add_default_project_fk;
DELIMITER //
CREATE PROCEDURE add_default_project_fk()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'customers'
      AND CONSTRAINT_NAME = 'fk_customer_default_project'
  ) THEN
    ALTER TABLE customers 
      ADD CONSTRAINT fk_customer_default_project 
      FOREIGN KEY (default_project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END//
DELIMITER ;
CALL add_default_project_fk();
DROP PROCEDURE IF EXISTS add_default_project_fk;

-- ============================================================
-- 5. Auto-migrate existing customer emails → customer_domains
--    Extracts domain from customers.email and inserts mappings.
--    Legacy email fallback still exists as step 3 in the resolver.
-- ============================================================
INSERT IGNORE INTO customer_domains (customer_id, project_id, domain)
SELECT 
  c.id AS customer_id,
  NULL AS project_id,
  LOWER(SUBSTRING_INDEX(c.email, '@', -1)) AS domain
FROM customers c
WHERE c.email IS NOT NULL 
  AND c.email != '' 
  AND c.email LIKE '%@%'
  AND LOWER(SUBSTRING_INDEX(c.email, '@', -1)) NOT IN (
    SELECT domain FROM customer_domains
  )
  -- Rule 5: Exclude public email domains from auto-migration
  AND LOWER(SUBSTRING_INDEX(c.email, '@', -1)) NOT IN (
    'gmail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com',
    'live.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com',
    'protonmail.com', 'proton.me', 'zoho.com', 'zoho.in',
    'yandex.com', 'mail.com', 'gmx.com', 'gmx.net',
    'rediffmail.com', 'msn.com', 'mail.ru',
    'googlemail.com', 'fastmail.com', 'tutanota.com'
  );

-- ============================================================
-- 6. Summary
-- ============================================================
SELECT 'v15 Migration complete! Tables: customer_domains, domain_approval_requests, held_emails. Column: customers.default_project_id. Existing customer emails auto-migrated.' AS migration_result;
