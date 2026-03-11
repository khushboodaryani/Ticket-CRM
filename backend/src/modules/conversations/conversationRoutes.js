// modules/conversations/conversationRoutes.js
import { Router } from "express";
import { authenticateToken } from "../../middlewares/auth.js";
import { getConversation, addMessage } from "./conversationController.js";

// These are nested under /api/tickets/:ticketId/
const router = Router({ mergeParams: true });
router.use(authenticateToken);

router.get("/conversation", getConversation);
router.post("/conversation/messages", addMessage);

export default router;
