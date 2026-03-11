// modules/queues/queueRoutes.js
import { Router } from "express";
import { authenticateToken, requireRole } from "../../middlewares/auth.js";
import { getQueues, getQueueById, createQueue, updateQueue, deleteQueue, assignAgents } from "./queueController.js";

const router = Router();
router.use(authenticateToken);

router.get("/", getQueues);
router.get("/:id", getQueueById);
router.post("/", requireRole("superadmin", "manager", "gm"), createQueue);
router.put("/:id", requireRole("superadmin", "manager", "gm"), updateQueue);
router.delete("/:id", requireRole("superadmin"), deleteQueue);
router.post("/:id/agents", requireRole("superadmin", "manager", "gm"), assignAgents);

export default router;
