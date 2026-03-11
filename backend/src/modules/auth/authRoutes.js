// modules/auth/authRoutes.js
import { Router } from "express";
import { login, getMe } from "./authController.js";
import { authenticateToken } from "../../middlewares/auth.js";

const router = Router();

router.post("/login", login);
router.get("/me", authenticateToken, getMe);

export default router;
