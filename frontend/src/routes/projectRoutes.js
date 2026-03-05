// src/routes/projectRoutes.js
import { Router } from "express";
import { authenticateToken, requireRole } from "../middlewares/auth.js";
import { getProjects, getProjectById, createProject, updateProject, deleteProject } from "../controllers/projectController.js";

const router = Router();
router.use(authenticateToken);

router.get("/", getProjects);
router.get("/:id", getProjectById);
router.post("/", requireRole("superadmin", "manager", "gm"), createProject);
router.put("/:id", requireRole("superadmin", "manager", "gm"), updateProject);
router.delete("/:id", requireRole("superadmin"), deleteProject);

export default router;
