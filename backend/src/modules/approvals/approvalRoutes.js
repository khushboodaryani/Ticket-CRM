// modules/approvals/approvalRoutes.js
import { Router } from "express";
import { authenticateToken, requireRole } from "../../middlewares/auth.js";
import { getDomainApprovals, getPendingCount, getApprovalDetail, approveDomain, rejectDomain } from "./approvalController.js";

const router = Router();
router.use(authenticateToken);

// All approval endpoints require superadmin role
router.get("/domains", requireRole("superadmin"), getDomainApprovals);
router.get("/domains/pending-count", requireRole("superadmin"), getPendingCount);
router.get("/domains/:id", requireRole("superadmin"), getApprovalDetail);
router.post("/domains/:id/approve", requireRole("superadmin"), approveDomain);
router.post("/domains/:id/reject", requireRole("superadmin"), rejectDomain);

export default router;
