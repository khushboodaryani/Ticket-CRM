// src/index.js

import dotenv from "dotenv";
import fs from "fs";
import https from "https";
import http from "http";
import 'colors';

dotenv.config({ path: './.env' });

import { app } from "./app.js";
import connectDB from "./db/index.js";
import { startSLAEngine } from "./modules/sla/slaEngine.js";
import { initWorkflowEngine } from "./modules/workflows/workflowEngine.js";
import { logger } from "./logger.js";
import { initSocket } from "./services/socketService.js";

// Verify necessary environment variables
if (!process.env.PORT) {
    console.error("❌ PORT environment variable is missing. Please set it in the .env file.".red.bold);
    process.exit(1);
}

// Create server based on environment
let server;
if (process.env.USE_HTTPS === 'true') {
    let sslOptions;
    try {
        sslOptions = {
            key: fs.readFileSync('ssl/privkey.pem'),
            cert: fs.readFileSync('ssl/fullchain.pem')
        };
        server = https.createServer(sslOptions, app);
        console.log('🔒 Initialized HTTPS server'.cyan.bold);
    } catch (error) {
        console.error("❌ Error loading SSL certificates. Check paths and permissions.".red.bold, error);
        process.exit(1);
    }
} else {
    server = http.createServer(app);
    console.log('🌐 Initialized HTTP server (Local Development)'.yellow.bold);
}

// Initialize the connection pool
const pool = connectDB();

process.title = 'Ticket CRM';

const startServer = async () => {
    try {
        await new Promise((resolve, reject) => {
            server.listen(process.env.PORT, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        const protocol = process.env.USE_HTTPS === 'true' ? 'https' : 'http';
        logger.info(`🚀 Ticket CRM Server running on ${protocol}://localhost:${process.env.PORT}`);
        logger.info(`📋 Environment: ${process.env.NODE_ENV || "development"}`);

        // Initialize Socket.io
        initSocket(server);

        // Start the SLA background engine
        startSLAEngine();

        // Initialize Workflow Engine
        initWorkflowEngine();

    } catch (error) {
        console.error("❌ Error starting server:", error);
        process.exit(1);
    }
};

// Graceful shutdown
const gracefulShutdown = async () => {
    console.log('⚠️  Received shutdown signal, closing server and database connections...'.yellow.bold);

    await pool.end().catch(err => console.error('Error closing MySQL pool:', err));

    server.close(() => {
        console.log('🔒 Server closed successfully.'.blue.bold);
        process.exit(0);
    });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Global error handling
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:'.red.bold);
    console.error(err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:'.red.bold, promise);
    console.error('Reason:', reason);
});

process.on('SIGABRT', () => {
    console.log('⚠️  SIGABRT received, handling gracefully...'.yellow.bold);
});

// Connect to MySQL and start server
const initApp = async () => {
    try {
        const connection = await pool.getConnection();
        connection.release();

        console.log('✅ MySQL connected'.green.bold);
        await startServer();
    } catch (err) {
        console.error("MySQL connection failed!!!".red.bold, err);
        process.exit(1);
    }
};

initApp();
