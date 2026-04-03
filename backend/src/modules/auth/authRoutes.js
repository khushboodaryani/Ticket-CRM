// modules/auth/authRoutes.js
import { Router } from "express";
import { login, getMe, verifyAndResetPassword, requestPasswordReset } from "./authController.js";
import { authenticateToken } from "../../middlewares/auth.js";

const router = Router();

router.post("/login", login);
router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password", verifyAndResetPassword);
router.get("/me", authenticateToken, getMe);

export default router;
