// src/modules/analytics/analyticsRoutes.js
import express from "express";
import { 
    getDashboardSummary, 
    getTicketTrends, 
    getSLAStatus, 
    getAgentPerformance,
    getSourceDistribution
} from "./analyticsController.js";
import { authenticateToken, requireRole } from "../../middlewares/auth.js";

const router = express.Router();

// All analytics require GM or Admin roles
router.use(authenticateToken);
router.use(requireRole("superadmin", "gm", "manager"));

router.get("/summary", getDashboardSummary);
router.get("/trends", getTicketTrends);
router.get("/sla", getSLAStatus);
router.get("/agents", getAgentPerformance);
router.get("/sources", getSourceDistribution);

export default router;
