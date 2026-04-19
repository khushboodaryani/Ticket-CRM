// src/modules/sla/slaRoutes.js
import { Router } from "express";
import { authenticateToken, requireRole } from "../../middlewares/auth.js";
import {
    getSLAPolicies,
    getConfiguredPriorityList,
    getPriorityCategories,
    getCustomerSLAPolicies,
    updateSLAPolicy,
    updateCustomerSLAPolicy,
    createSLAPolicy,
    deleteSLAPolicy,
    getSLACalendar,
    updateSLACalendar
} from "./slaController.js";

const router = Router();

router.use(authenticateToken);

router.get("/", requireRole("superadmin", "manager"), getSLAPolicies);
router.get("/priorities", requireRole("superadmin", "manager", "tl", "agent"), getConfiguredPriorityList);
router.get("/categories", requireRole("superadmin", "manager"), getPriorityCategories);
router.get("/customer/:customerId", requireRole("superadmin", "manager"), getCustomerSLAPolicies);
router.post("/customer/:customerId", requireRole("superadmin", "manager"), updateCustomerSLAPolicy);
router.get("/calendar", requireRole("superadmin", "manager"), getSLACalendar);
router.put("/calendar", requireRole("superadmin", "manager"), updateSLACalendar);

router.post("/", requireRole("superadmin", "manager"), createSLAPolicy);
router.put("/:id", requireRole("superadmin", "manager"), updateSLAPolicy);
router.delete("/:id", requireRole("superadmin", "manager"), deleteSLAPolicy);

export default router;
