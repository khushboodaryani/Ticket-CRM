// src/modules/sla/slaRoutes.js
import { Router } from "express";
import { authenticateToken, requireRole } from "../../middlewares/auth.js";
import { getSLAPolicies, updateSLAPolicy } from "./slaController.js";

const router = Router();

router.use(authenticateToken);

router.get("/", requireRole("superadmin", "manager"), getSLAPolicies);
router.put("/:id", requireRole("superadmin", "manager"), updateSLAPolicy);

export default router;
