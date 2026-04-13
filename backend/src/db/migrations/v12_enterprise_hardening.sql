-- backend/src/db/migrations/v12_enterprise_hardening.sql

-- 1. Ensure Ticket Numbers are uniquely indexed for high-scale lookups
CREATE UNIQUE INDEX IF NOT EXISTS uidx_ticket_number ON tickets(ticket_number);

-- 2. Ensure Customer Emails are indexed for fast identification
CREATE INDEX IF NOT EXISTS idx_customer_email ON customers(email);

-- 3. Upgrade email_logs.message_id to UNIQUE to prevent race conditions in poller
-- We use a Try/Catch style approach if the index already exists as non-unique
DROP INDEX IF EXISTS idx_msg_id ON email_logs;
CREATE UNIQUE INDEX uidx_email_msg_id ON email_logs(message_id);

-- 4. Optimization for conversation participant lookups
CREATE INDEX IF NOT EXISTS idx_participant_email_type ON conversation_participants(email, type);

SELECT 'Enterprise Hardening Migration Applied!' AS result;
