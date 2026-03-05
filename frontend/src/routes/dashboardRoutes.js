// src/routes/dashboardRoutes.js
import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.js";
import { getDashboard } from "../controllers/dashboardController.js";

const router = Router();
router.use(authenticateToken);
router.get("/", getDashboard);

export default router;
