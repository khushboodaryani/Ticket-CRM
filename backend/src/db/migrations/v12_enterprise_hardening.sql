-- backend/src/db/migrations/v12_enterprise_hardening.sql

-- 1. Ensure Ticket Numbers are uniquely indexed for high-scale lookups
CREATE UNIQUE INDEX uidx_ticket_number ON tickets(ticket_number);

-- 2. Ensure Customer Emails are indexed for fast identification
CREATE INDEX idx_customer_email ON customers(email);

-- 3. Upgrade email_logs.message_id to UNIQUE to prevent race conditions in poller
-- We use a Try/Catch style approach if the index already exists as non-unique
DROP INDEX idx_msg_id ON email_logs;
CREATE UNIQUE INDEX uidx_email_msg_id ON email_logs(message_id);

-- 4. Optimization for conversation participant lookups
CREATE INDEX idx_participant_email_type ON conversation_participants(email, type);

-- 5. Strict Idempotency: Prevent duplicate messages at database level
CREATE UNIQUE INDEX uidx_cm_message_id ON conversation_messages(message_id);

SELECT 'Enterprise Hardening Migration (v12.1) Applied!' AS result;
