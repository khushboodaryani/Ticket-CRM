// modules/dashboard/dashboardRoutes.js
import { Router } from "express";
import { authenticateToken } from "../../middlewares/auth.js";
import { getDashboard } from "./dashboardController.js";
import { getSnapshot, getQueueDetail, getAgentDetail, getShiftDetail } from "./monitoringController.js";

const router = Router();
router.use(authenticateToken);

router.get("/", getDashboard);
router.get("/monitoring/snapshot", getSnapshot);
router.get("/monitoring/queue/:id", getQueueDetail);
router.get("/monitoring/agent/:id", getAgentDetail);
router.get("/monitoring/shift/:id", getShiftDetail);

export default router;
