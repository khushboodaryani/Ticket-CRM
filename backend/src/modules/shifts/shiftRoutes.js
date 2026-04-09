// modules/shifts/shiftRoutes.js
import { Router } from "express";
import { authenticateToken, requireRole } from "../../middlewares/auth.js";
import { getShifts, getShiftById, createShift, updateShift, updateShiftMembers, deleteShift } from "./shiftController.js";

const router = Router();
router.use(authenticateToken);

router.get("/", getShifts);
router.get("/:id", getShiftById);
router.post("/", requireRole("superadmin"), createShift);
router.put("/:id", requireRole("superadmin"), updateShift);
router.delete("/:id", requireRole("superadmin"), deleteShift);
router.post("/:id/members", requireRole("superadmin"), updateShiftMembers);

export default router;
