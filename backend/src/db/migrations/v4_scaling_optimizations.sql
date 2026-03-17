-- ============================================================
-- Ticket CRM – v4 Scaling & Performance Optimizations
-- Aim: Support 1M tickets/day (Peak 600 TPS) without Kafka
-- ============================================================

USE ticket_crm;

-- 1. Optimize Ticket Lookups for Unified Queues
-- Most frequent UI view: Filter by status, then sort by priority/date
ALTER TABLE tickets ADD INDEX idx_scaling_status_priority_date (status, priority, created_at);

-- 2. Fast Conversation Correlation
-- Inbound emails/messages look up by source_thread_id
ALTER TABLE conversations ADD INDEX  idx_scaling_thread_id (source_thread_id);

-- 3. High-Speed Thread Loading
-- Loading the full chat thread in TicketDetail
ALTER TABLE conversation_messages ADD INDEX  idx_scaling_conv_date (conversation_id, created_at);

-- 4. Optimized Audit Trail
-- Loading Activity Log tab in TicketDetail
ALTER TABLE ticket_activities ADD INDEX  idx_scaling_ticket_date (ticket_id, created_at);

-- 5. Notification Performance
-- Fetching latest notifications for the Topbar
ALTER TABLE in_app_notifications ADD INDEX idx_scaling_user_created (user_id, created_at);

SELECT 'v4 Scaling Optimizations applied successfully!' AS migration_result;
