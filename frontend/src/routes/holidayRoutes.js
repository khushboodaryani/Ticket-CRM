// src/routes/holidayRoutes.js
import { Router } from "express";
import { authenticateToken, requireRole } from "../middlewares/auth.js";
import { getHolidays, createHoliday, bulkCreateHolidays, deleteHoliday } from "../controllers/holidayController.js";

const router = Router();
router.use(authenticateToken);

router.get("/", getHolidays);
router.post("/", requireRole("superadmin"), createHoliday);
router.post("/bulk", requireRole("superadmin"), bulkCreateHolidays);
router.delete("/:id", requireRole("superadmin"), deleteHoliday);

export default router;
