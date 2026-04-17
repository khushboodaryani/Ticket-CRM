-- ============================================================
-- Ticket CRM - v21 Production Monitoring & Agent Status
-- ============================================================

USE ticket_crm;

-- Add new columns to users table for real-time monitoring
ALTER TABLE users 
ADD COLUMN status ENUM('available', 'on_call', 'idle', 'away', 'offline') DEFAULT 'offline' AFTER is_online,
ADD COLUMN status_source ENUM('manual', 'system') DEFAULT 'manual' AFTER status,
ADD COLUMN extension VARCHAR(20) DEFAULT NULL AFTER status_source,
ADD COLUMN last_heartbeat DATETIME DEFAULT NULL AFTER extension;

-- Create a table for dashboard cache/telemetry if needed later
CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  snapshot_data JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT 'v21 Monitoring migration complete!' AS migration_result;
