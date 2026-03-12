# Database Setup & SQL Execution Order

To set up the Ticket CRM database from scratch, follow the execution order below. These files should be run against your MySQL/MariaDB database in the exact sequence listed.

## 1. Core Schema
This file creates the entire database structure, including tables, initial constraints, and base roles.
- **File**: `backend/src/db/schema.sql`
- **Purpose**: Establishes the foundation of the CRM.

## 2. Feature Migrations (Chronological)
Apply these migrations in order to add advanced features and optimizations that were developed during later phases.

### A. Blueprint Features
- **File**: `backend/src/db/migrations/v2_blueprint_features.sql`
- **Purpose**: Adds support for granular SLA targets, flexible shift management, and complex ticket routing logic.

### B. Scaling Optimizations
- **File**: `backend/src/db/migrations/v4_scaling_optimizations.sql`
- **Purpose**: Adds critical composite indexes to the `tickets` and `notifications` tables to handle high-volume enterprise traffic (up to 1M tickets/day).

### C. Workflow Automation Engine
- **File**: `backend/src/db/migrations/v5_workflow_engine.sql`
- **Purpose**: Creates the `workflow_rules` and `workflow_runs` tables required for the Event-Driven Automation system.

---

## Execution Command Example
If you are using the MySQL CLI, you can run these commands:

```bash
# 1. Base Schema
mysql -u your_user -p your_db_name < backend/src/db/schema.sql

# 2. Migrations
mysql -u your_user -p your_db_name < backend/src/db/migrations/v2_blueprint_features.sql
mysql -u your_user -p your_db_name < backend/src/db/migrations/v4_scaling_optimizations.sql
mysql -u your_user -p your_db_name < backend/src/db/migrations/v5_workflow_engine.sql
```

> [!IMPORTANT]
> Ensure your `.env` file in the `backend` folder is correctly configured with your database credentials before starting the application.
