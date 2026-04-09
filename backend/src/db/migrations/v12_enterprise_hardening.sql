-- backend/src/db/migrations/v12_enterprise_hardening.sql

-- 1. Add Unique Constraint to email_logs for Idempotency
-- This prevents the same message-id from being logged/processed twice at the DB level
ALTER TABLE email_logs MODIFY message_id VARCHAR(255) NOT NULL;
CREATE UNIQUE INDEX unique_log_message_id ON email_logs(message_id);

-- 2. Ensure message_id is indexed for fast lookup in participant fallback scenarios
-- (v11 already added INDEX, this is a safety check)
-- CREATE UNIQUE INDEX unique_message_id ON conversation_messages(message_id); -- ALREADY EXISTS FROM V11

-- 3. Add index to created_at for chronological sorting performance in trails
CREATE INDEX idx_msg_created_at ON conversation_messages(created_at);
CREATE INDEX idx_act_created_at ON ticket_activities(created_at);
