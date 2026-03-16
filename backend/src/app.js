// src/app.js  — Modular Monolith version
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

import { errorHandler, notFoundHandler } from "./middlewares/errorHandling.js";

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


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

const allowedOrigins = [
    "http://localhost:4455",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8450",
    process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
    origin: (origin, cb) => (!origin || allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error("Not allowed by CORS"))),
    credentials: true,
    optionsSuccessStatus: 200,
}));

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Serve uploaded attachments statically
app.use("/attachments", express.static(path.join(__dirname, "..", "public", "attachments")));

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


app.use(notFoundHandler);
app.use(errorHandler);

process.on("uncaughtException", (err) => console.error("Uncaught Exception:", err));
process.on("unhandledRejection", (reason) => console.error("Unhandled Rejection:", reason));

export { app };
