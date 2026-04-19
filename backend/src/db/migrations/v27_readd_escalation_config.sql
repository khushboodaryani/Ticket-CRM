-- v27_readd_escalation_config.sql
USE ticket_crm;

ALTER TABLE sla_policies_new
  ADD COLUMN escalation_1_min INT UNSIGNED DEFAULT NULL,
  ADD COLUMN escalation_2_min INT UNSIGNED DEFAULT NULL,
  ADD COLUMN escalation_3_min INT UNSIGNED DEFAULT NULL;
