// modules/dashboard/dashboardRoutes.js
import { Router } from "express";
import { authenticateToken } from "../../middlewares/auth.js";
import { getDashboard } from "./dashboardController.js";

const router = Router();
router.use(authenticateToken);

router.get("/", getDashboard);

export default router;
