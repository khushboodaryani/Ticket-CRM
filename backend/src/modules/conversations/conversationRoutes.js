// modules/conversations/conversationRoutes.js
import { Router } from "express";
import { authenticateToken } from "../../middlewares/auth.js";
import { getConversation, addMessage } from "./conversationController.js";
import { downloadAttachment } from "./attachmentController.js";
import { upload } from "../../middlewares/upload.js";

// These are nested under /api/tickets/:ticketId/
const router = Router({ mergeParams: true });
router.use(authenticateToken);

router.get("/conversation", getConversation);
router.post("/conversation/messages", upload.array('attachments', 5), addMessage);
router.get("/attachments/:id", downloadAttachment);

export default router;
