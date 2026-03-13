// src/modules/workflows/workflowRoutes.js
import express from 'express';
import { authenticateToken, requireRole } from '../../middlewares/auth.js';
import { getRules, createRule, updateRule, deleteRule, toggleRule, getRunsForTicket } from './workflowController.js';

const router = express.Router();

// Admin only routes for managing rules
router.get('/rules', authenticateToken, requireRole('superadmin', 'gm', 'manager'), getRules);
router.post('/rules', authenticateToken, requireRole('superadmin', 'gm', 'manager'), createRule);
router.put('/rules/:id', authenticateToken, requireRole('superadmin', 'gm', 'manager'), updateRule);
router.patch('/rules/:id/toggle', authenticateToken, requireRole('superadmin', 'gm', 'manager'), toggleRule);
router.delete('/rules/:id', authenticateToken, requireRole('superadmin', 'gm', 'manager'), deleteRule);

// View execution logs for a ticket
router.get('/runs/:ticketId', authenticateToken, getRunsForTicket);

export default router;
