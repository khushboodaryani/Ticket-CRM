// src/index.js
import dotenv from "dotenv";
dotenv.config();

import { app } from "./app.js";
import connectDB from "./db/index.js";
import { startSLAEngine } from "./services/slaEngine.js";
import { logger } from "./logger.js";

const PORT = process.env.PORT || 8450;

async function startServer() {
    try {
        // Verify DB connection before starting
        const pool = connectDB();
        const conn = await pool.getConnection();
        logger.info("✅ Database connection verified.");
        conn.release();

        app.listen(PORT, () => {
            logger.info(`🚀 Ticket CRM Server running on http://localhost:${PORT}`);
            logger.info(`📋 Environment: ${process.env.NODE_ENV || "development"}`);
        });

        // Start the SLA background engine
        startSLAEngine();

    } catch (err) {
        logger.error("❌ Server startup failed:", err.message);
        process.exit(1);
    }
}

startServer();
