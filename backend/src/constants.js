// src/constants.js
export const DB_NAME = process.env.DB_NAME || "ticket_crm";

export const ROLES = {
  SUPER_ADMIN: "superadmin",
  GM: "gm",
  MANAGER: "manager",
  TL: "tl",
  AGENT: "agent",
};

export const TICKET_STATUS = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  PENDING: "pending",
  RESOLVED: "resolved",
  CLOSED: "closed",
};

// Default priorities — actual configured priorities are stored in sla_policies table (dynamic P1–P10+).
// This array is kept as a UI fallback only. Use getConfiguredPriorities() for validation.
export const PRIORITY = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10"];

export const TICKET_SOURCE = {
  EMAIL: "email",
  CALL: "call",
  MANUAL: "manual",
};

// Escalation thresholds in minutes (shift-aware)
export const ESCALATION_THRESHOLDS = {
  1: 60,    // Level 1 → TL after 1 hour
  2: 90,    // Level 2 → Manager after 1h 30m
  3: 120,   // Level 3 → GM after 2 hours
};
