// modules/notifications/notificationRoutes.js
import { Router } from "express";
import { authenticateToken, requireRole } from "../../middlewares/auth.js";
import {
    getMyNotifications,
    markRead,
    markAllRead,
    getNotificationTemplates,
    updateNotificationTemplate,
    resetNotificationTemplate,
    previewNotificationTemplate,
} from "./notificationController.js";

const router = Router();
router.use(authenticateToken);

router.get("/", getMyNotifications);
router.get("/templates", requireRole("superadmin", "gm", "manager"), getNotificationTemplates);
router.put("/templates/:templateKey", requireRole("superadmin", "gm", "manager"), updateNotificationTemplate);
router.delete("/templates/:templateKey", requireRole("superadmin", "gm", "manager"), resetNotificationTemplate);
router.post("/templates/:templateKey/preview", requireRole("superadmin", "gm", "manager"), previewNotificationTemplate);
router.put("/read-all", markAllRead);
router.put("/:id/read", markRead);

export default router;
