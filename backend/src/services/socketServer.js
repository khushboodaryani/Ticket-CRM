// src/services/socketServer.js
import { Server } from "socket.io";
import { logger } from "../logger.js";
import connectDB from "../db/index.js";
import * as widgetAdapter from "../modules/conversations/adapters/widgetAdapter.js";

let io;
const HEARTBEAT_INTERVAL = 30000; // 30s
const HEARTBEAT_TIMEOUT = 90000;  // 90s (As per SaaS feedback)

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        },
        pingInterval: HEARTBEAT_INTERVAL,
        pingTimeout: HEARTBEAT_TIMEOUT
    });

    io.on("connection", (socket) => {
        logger.info(`🔌 New connection: ${socket.id}`);

        socket.on("join", async (userId) => {
            if (userId) {
                socket.userId = userId;
                socket.join(`user_${userId}`);
                logger.info(`👤 User ${userId} joined room user_${userId}`);

                // Update online status and set available status by default
                try {
                    const pool = connectDB();
                    await pool.query(
                        "UPDATE users SET is_online = 1, status = 'available', status_source = 'system', last_heartbeat = NOW() WHERE id = ?",
                        [userId]
                    );
                } catch (err) {
                    logger.error(`[Socket] Failed to update user ${userId}: ${err.message}`);
                }
            }
        });

        // Dashboard Subscriptions
        socket.on("subscribe_monitoring", (rooms) => {
            if (Array.isArray(rooms)) {
                rooms.forEach(room => {
                    socket.join(room);
                    logger.info(`📡 Socket ${socket.id} subscribed to ${room}`);
                });
            }
        });

        socket.on("unsubscribe_monitoring", (rooms) => {
            if (Array.isArray(rooms)) {
                rooms.forEach(room => {
                    socket.leave(room);
                    logger.info(`📡 Socket ${socket.id} unsubscribed from ${room}`);
                });
            }
        });

        // Guest Messaging (Existing functionality)
        socket.on("guest_message", (payload) => {
            widgetAdapter.handleWidgetMessage(socket, payload);
        });

        // Heartbeat ACK from client
        socket.on("heartbeat_ack", async (userId) => {
            if (userId) {
                try {
                    const pool = connectDB();
                    await pool.query(
                        "UPDATE users SET last_heartbeat = NOW(), status_source = 'system' WHERE id = ?", 
                        [userId]
                    );
                } catch (err) { /* silent fail */ }
            }
        });

        socket.on("disconnect", async () => {
            logger.info(`🔌 Disconnected: ${socket.id}`);
            
            if (socket.userId) {
                const userId = socket.userId;
                // Hybrid Status Logic: Wait for heartbeat timeout before marking fully offline
                // But for now, we follow the current project's logic of multi-socket awareness
                const remainingSockets = await io.in(`user_${userId}`).fetchSockets();
                
                if (remainingSockets.length === 0) {
                    logger.info(`👤 User ${userId} is now idle (no active sockets).`);
                    // We'll let the background heartbeat check handle the "Offline" transition 
                    // if they don't reconnect within the timeout.
                    // For legacy support, we update is_online = 0
                    try {
                        const pool = connectDB();
                        await pool.query("UPDATE users SET is_online = 0 WHERE id = ?", [userId]);
                    } catch (err) { }
                }
            }
        });
    });

    // Background presence worker: Detect ghost agents
    setInterval(async () => {
        try {
            const pool = connectDB();
            // Mark agents as Offline (System) if they haven't sent a heartbeat in 90s
            // 1. Clean up stale SYSTEM presence (90 seconds)
            await pool.query(
                `UPDATE users 
                 SET is_online = 0, status = 'offline', status_source = 'system' 
                 WHERE is_online = 1 
                   AND status_source = 'system'
                   AND (last_heartbeat < (NOW() - INTERVAL 90 SECOND) OR last_heartbeat IS NULL)
                   AND role != 'superadmin'`
            );

            // 2. Safety Valve: Clean up stale MANUAL presence (10 minutes)
            await pool.query(
                `UPDATE users 
                 SET is_online = 0, status = 'offline', status_source = 'system' 
                 WHERE is_online = 1 
                   AND status_source = 'manual'
                   AND (last_heartbeat < (NOW() - INTERVAL 10 MINUTE) OR last_heartbeat IS NULL)
                   AND role != 'superadmin'`
            );
        } catch (err) {
            logger.error(`[PresenceWorker] Error: ${err.message}`);
        }
    }, 30000);

    return io;
};

export const getIO = () => {
    if (!io) throw new Error("Socket.io not initialized!");
    return io;
};

export const emitToUser = (userId, event, data) => {
    if (io) io.to(`user_${userId}`).emit(event, data);
};

export const broadcast = (event, data) => {
    if (io) io.emit(event, data);
};
