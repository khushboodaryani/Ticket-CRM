-- Database Migration: v16_soft_delete_customers
-- Goal: Add is_deleted flag to customers table to support soft deletion and preserve historical data.

-- 1. Add is_deleted column
ALTER TABLE customers ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0;

-- 2. Add index for performance on filtering active customers
CREATE INDEX idx_customers_is_deleted ON customers (is_deleted);

-- 3. (Optional) Soft delete projects too to avoid similar FK errors when deleting projects
-- We add the column to projects table as well for consistency.
ALTER TABLE projects ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0;
CREATE INDEX idx_projects_is_deleted ON projects (is_deleted);
