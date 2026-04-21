// modules/users/userRoutes.js
import { Router } from "express";
import { authenticateToken, requireRole } from "../../middlewares/auth.js";
import { getUsers, getUserById, createUser, updateUser, getHierarchy } from "./userController.js";
import { updatePresence, getMyPresence } from "./presenceController.js";

const router = Router();
router.use(authenticateToken);

// Presence
router.get("/presence/me", getMyPresence);
router.post("/presence", updatePresence);

router.get("/", getUsers);
router.get("/hierarchy/tree", getHierarchy);
router.get("/:id", getUserById);
router.post("/", requireRole("superadmin"), createUser);
router.put("/:id", requireRole("superadmin", "manager", "gm"), updateUser);

export default router;
