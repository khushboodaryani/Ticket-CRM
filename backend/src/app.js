// src/app.js  — Modular Monolith version
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();
import { logger } from "./logger.js";

import { errorHandler, notFoundHandler } from "./middlewares/errorHandling.js";
import { rateLimit } from "express-rate-limit";
import { authenticateToken } from "./middlewares/auth.js";
import { getAttachmentByFilename } from "./modules/conversations/attachmentController.js";

// === Module Imports ===
import authRoutes         from "./modules/auth/authRoutes.js";
import userRoutes         from "./modules/users/userRoutes.js";
import customerRoutes     from "./modules/customers/customerRoutes.js";
import projectRoutes      from "./modules/projects/projectRoutes.js";
import ticketRoutes       from "./modules/tickets/ticketRoutes.js";
import shiftRoutes        from "./modules/shifts/shiftRoutes.js";
import holidayRoutes      from "./modules/holidays/holidayRoutes.js";
import dashboardRoutes    from "./modules/dashboard/dashboardRoutes.js";
import queueRoutes        from "./modules/queues/queueRoutes.js";
import notificationRoutes from "./modules/notifications/notificationRoutes.js";
import workflowRoutes     from "./modules/workflows/workflowRoutes.js";
import analyticsRoutes    from "./modules/analytics/analyticsRoutes.js";
import slaRoutes          from "./modules/sla/slaRoutes.js";
import domainRoutes       from "./modules/customers/domainRoutes.js";
import approvalRoutes     from "./modules/approvals/approvalRoutes.js";
import { mountQueueDashboard } from "./services/queueDashboard.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', true);

const colorizeHttp = {
    dim: (text) => `\x1b[90m${text}\x1b[0m`,
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    magenta: (text) => `\x1b[35m${text}\x1b[0m`,
    white: (text) => `\x1b[97m${text}\x1b[0m`,
    bgBlue: (text) => `\x1b[44;97m ${text} \x1b[0m`,
    bgGreen: (text) => `\x1b[42;97m ${text} \x1b[0m`,
    bgYellow: (text) => `\x1b[43;30m ${text} \x1b[0m`,
    bgRed: (text) => `\x1b[41;97m ${text} \x1b[0m`,
    bgCyan: (text) => `\x1b[46;30m ${text} \x1b[0m`,
    bgMagenta: (text) => `\x1b[45;97m ${text} \x1b[0m`,
    bgGray: (text) => `\x1b[100;97m ${text} \x1b[0m`,
};

function getMethodColor(method) {
    if (method === "GET") return colorizeHttp.green;
    if (method === "POST") return colorizeHttp.cyan;
    if (method === "PUT" || method === "PATCH") return colorizeHttp.blue;
    if (method === "DELETE") return colorizeHttp.red;
    return colorizeHttp.magenta;
}

function getStatusColor(statusCode) {
    if (statusCode >= 500) return colorizeHttp.red;
    if (statusCode >= 400) return colorizeHttp.yellow;
    if (statusCode >= 300) return colorizeHttp.cyan;
    return colorizeHttp.green;
}

function getMethodBadge(method) {
    const label = method.padEnd(7);
    if (method === "GET") return colorizeHttp.bgGreen(label);
    if (method === "POST") return colorizeHttp.bgCyan(label);
    if (method === "PUT" || method === "PATCH") return colorizeHttp.bgBlue(label);
    if (method === "DELETE") return colorizeHttp.bgRed(label);
    return colorizeHttp.bgMagenta(label);
}

function getStatusBadge(statusCode) {
    const label = `STATUS ${statusCode}`;
    if (statusCode >= 500) return colorizeHttp.bgRed(label);
    if (statusCode >= 400) return colorizeHttp.bgYellow(label);
    if (statusCode >= 300) return colorizeHttp.bgCyan(label);
    return colorizeHttp.bgGreen(label);
}

function getResponseBadge(durationMs) {
    const label = `RESP ${durationMs}ms`;
    if (durationMs >= 3000) return colorizeHttp.bgRed(label);
    if (durationMs >= 1000) return colorizeHttp.bgYellow(label);
    return colorizeHttp.bgBlue(label);
}

app.use((req, res, next) => {
    const startedAt = Date.now();

    res.on("finish", () => {
        const durationMs = Date.now() - startedAt;
        const now = new Date();
        const timeLabel = now.toLocaleTimeString("en-IN", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
        const dayDateLabel = now.toLocaleDateString("en-IN", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
        const methodBadge = getMethodBadge(req.method);
        const statusBadge = getStatusBadge(res.statusCode);
        const responseBadge = getResponseBadge(durationMs);
        const ipBadge = colorizeHttp.bgGray(`IP ${req.ip || req.socket?.remoteAddress || "unknown"}`);
        const routeLabel = colorizeHttp.white(req.originalUrl);
        const logLine = `${colorizeHttp.dim(`[${dayDateLabel}, ${timeLabel}]`)} ${methodBadge} ${statusBadge} ${responseBadge} ${ipBadge} ${routeLabel}`;

        if (res.statusCode >= 500) {
            logger.error(logLine);
        } else if (res.statusCode >= 400) {
            logger.warn(logLine);
        } else {
            logger.info(logLine);
        }
    });

    next();
});

const allowedOrigins = [
    "http://localhost:4455",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8450",
    "http://support.voicemeetme.net:8994",
    "https://support.voicemeetme.net",
    process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
    origin: (origin, cb) => (!origin || allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error("Not allowed by CORS"))),
    credentials: true,
    optionsSuccessStatus: 200,
}));

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Secure Attachment Proxy (Replacement for express.static)
const attachmentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: "Too many download requests. Please try again later." }
});
app.get("/attachments/:filename", authenticateToken, attachmentLimiter, getAttachmentByFilename);

// Health check
app.get("/health", (req, res) => res.json({ status: "ok", service: "Ticket CRM Backend (Modular)", timestamp: new Date().toISOString() }));

// === API Routes ===
app.use("/api/auth",           authRoutes);
app.use("/api/users",          userRoutes);
app.use("/api/customers",      customerRoutes);
app.use("/api/projects",       projectRoutes);
app.use("/api/tickets",        ticketRoutes);
app.use("/api/shifts",         shiftRoutes);
app.use("/api/holidays",       holidayRoutes);
app.use("/api/dashboard",      dashboardRoutes);
app.use("/api/queues",         queueRoutes);
app.use("/api/notifications",  notificationRoutes);
app.use("/api/workflows",      workflowRoutes);
app.use("/api/analytics",      analyticsRoutes);
app.use("/api/sla",            slaRoutes);
app.use("/api/domains",        domainRoutes);
app.use("/api/approvals",      approvalRoutes);

mountQueueDashboard(app);

app.use(notFoundHandler);
app.use(errorHandler);

process.on("uncaughtException", (err) => console.error("Uncaught Exception:", err));
process.on("unhandledRejection", (reason) => console.error("Unhandled Rejection:", reason));

export { app };
