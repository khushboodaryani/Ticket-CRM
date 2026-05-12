// modules/tickets/ticketRoutes.js
import { Router } from "express";
import { authenticateToken, requireRole } from "../../middlewares/auth.js";
import { upload } from "../../middlewares/upload.js";
import {
    getTickets, getTicketById, createTicket, updateTicket,
    escalateTicket, getSTRQueue,
    importTickets, exportTickets, bulkUpdateTickets,
    assignQueue, changePriority,
    addTask, getTasks, updateTask, slaHold, pingSocket,
    addParticipants, getParticipants
} from "./ticketController.js";
import conversationRoutes from "../conversations/conversationRoutes.js";

const router = Router();
router.use(authenticateToken);

// STR Queue & Bulk tools — before /:id to avoid routing conflicts
router.get("/queue/str", getSTRQueue);
router.post("/import", requireRole("superadmin", "gm", "manager"), importTickets);
router.get("/export", exportTickets);
router.put("/bulk", bulkUpdateTickets);

// Main CRUD
router.get("/", getTickets);
router.get("/:id", getTicketById);
router.post("/", upload.single("attachment"), createTicket);
router.put("/:id", upload.single("attachment"), updateTicket);
router.post("/:id/escalate", requireRole("superadmin", "gm", "manager", "tl", "agent"), escalateTicket);
router.put("/:id/sla-hold", requireRole("superadmin", "manager"), slaHold);
router.post("/:id/ping", pingSocket);

// Queue assignment
router.put("/:id/queue", requireRole("superadmin", "gm", "manager", "tl"), assignQueue);

// Priority change
router.put("/:id/priority", requireRole("superadmin", "gm", "manager", "tl"), changePriority);

// Sub-tasks
router.get("/:id/tasks", getTasks);
router.post("/:id/tasks", addTask);
router.put("/:id/tasks/:taskId", updateTask);

// Conversation participants
router.get("/:id/participants", getParticipants);
router.post("/:id/participants", addParticipants);

// Conversation thread (nested under ticket routes)
router.use("/:ticketId", conversationRoutes);

export default router;
