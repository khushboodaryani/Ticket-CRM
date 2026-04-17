-- backend/src/db/migrations/v17_nullable_project_id.sql
-- Description: Makes project_id nullable in the tickets table to support "Customer Root" tickets.

ALTER TABLE tickets MODIFY project_id INT UNSIGNED NULL;
