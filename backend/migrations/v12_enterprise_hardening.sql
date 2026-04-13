
-- v12_enterprise_hardening.sql
-- Performance optimization for high-volume email ticket pipeline

USE ticket_crm;

-- 1. Conversation Messages optimizations
-- Threading lookups (critical for emailPoller)
CREATE INDEX idx_msg_irt ON conversation_messages(in_reply_to);

-- Trail generation optimization (critical for emailService/adapter)
-- (Ensures getConversationTrailHtml doesn't perform a table sort)
CREATE INDEX idx_msg_conv_created ON conversation_messages(conversation_id, created_at DESC);

-- 2. Ticket table optimizations for Dashboards and Claims
-- P1 Claim logic optimization
CREATE INDEX idx_tkt_prio_assign ON tickets(priority, assigned_to);

-- General Dashboard filtering composite
CREATE INDEX idx_tkt_assign_status ON tickets(assigned_to, status);

-- 3. Participant mapping optimization
-- Lookup conversation by email (strict fallback in emailPoller)
CREATE INDEX idx_cp_email_lookup ON conversation_participants(email, type);


-- 4. Audit Log support (pre-creation for security audit logs)
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  action VARCHAR(100) NOT NULL,
  user_id INT UNSIGNED,
  entity_type VARCHAR(50),
  entity_id INT UNSIGNED,
  details JSON,
  ip_address VARCHAR(45),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_entity (entity_type, entity_id)
);
