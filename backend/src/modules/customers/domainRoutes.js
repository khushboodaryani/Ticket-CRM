import { Router } from "express";
import { authenticateToken, requireRole } from "../../middlewares/auth.js";
import { 
    getAllDomains, 
    getCustomerDomains, 
    addCustomerDomain, 
    updateDomain, 
    deleteDomain,
    checkDomainIngestion 
} from "./domainController.js";

const router = Router();
router.use(authenticateToken);

// Diagnostic tool
router.get("/check", requireRole("superadmin", "gm", "manager"), checkDomainIngestion);

// Admin overview — all domains
router.get("/", requireRole("superadmin", "gm", "manager"), getAllDomains);

// Per-customer domain management
router.get("/customer/:id", requireRole("superadmin", "gm", "manager"), getCustomerDomains);
router.post("/customer/:id", requireRole("superadmin", "manager"), addCustomerDomain);

// Domain-level operations
router.put("/:domainId", requireRole("superadmin", "manager"), updateDomain);
router.delete("/:domainId", requireRole("superadmin"), deleteDomain);

export default router;
