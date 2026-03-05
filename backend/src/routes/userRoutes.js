// src/routes/userRoutes.js
import { Router } from "express";
import { authenticateToken, requireRole } from "../middlewares/auth.js";
import { getUsers, getUserById, createUser, updateUser, getHierarchy } from "../controllers/userController.js";

const router = Router();
router.use(authenticateToken);

router.get("/", getUsers);
router.get("/hierarchy/tree", getHierarchy);
router.get("/:id", getUserById);
router.post("/", requireRole("superadmin"), createUser);
router.put("/:id", requireRole("superadmin", "manager", "gm"), updateUser);

export default router;
