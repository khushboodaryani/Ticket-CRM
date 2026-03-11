// modules/notifications/notificationRoutes.js
import { Router } from "express";
import { authenticateToken } from "../../middlewares/auth.js";
import { getMyNotifications, markRead, markAllRead } from "./notificationController.js";

const router = Router();
router.use(authenticateToken);

router.get("/", getMyNotifications);
router.put("/read-all", markAllRead);
router.put("/:id/read", markRead);

export default router;
