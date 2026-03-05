// src/routes/customerRoutes.js
import { Router } from "express";
import { authenticateToken, requireRole } from "../middlewares/auth.js";
import { getCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer } from "../controllers/customerController.js";

const router = Router();
router.use(authenticateToken);

router.get("/", getCustomers);
router.get("/:id", getCustomerById);
router.post("/", requireRole("superadmin", "manager", "gm"), createCustomer);
router.put("/:id", requireRole("superadmin", "manager", "gm"), updateCustomer);
router.delete("/:id", requireRole("superadmin"), deleteCustomer);

export default router;
