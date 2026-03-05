// src/routes/ticketRoutes.js
import { Router } from "express";
import { authenticateToken, requireRole } from "../middlewares/auth.js";
import { upload } from "../middlewares/upload.js";
import {
    getTickets, getTicketById, createTicket, updateTicket,
    escalateTicket, getSTRQueue,
    importTickets, exportTickets, bulkUpdateTickets
} from "../controllers/ticketController.js";

const router = Router();
router.use(authenticateToken);

router.get("/queue/str", getSTRQueue);

// Bulk tools — must be before /:id to avoid routing conflicts
router.post("/import", requireRole("superadmin", "gm", "manager"), importTickets);
router.get("/export", exportTickets);
router.put("/bulk", bulkUpdateTickets);

router.get("/", getTickets);
router.get("/:id", getTicketById);
router.post("/", upload.single("attachment"), createTicket);
router.put("/:id", upload.single("attachment"), updateTicket);
router.post("/:id/escalate", requireRole("superadmin", "gm", "manager", "tl"), escalateTicket);

export default router;
