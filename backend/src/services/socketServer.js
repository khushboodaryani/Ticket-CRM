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
            // Only update DB for real users (numeric IDs), skip for guest strings
            if (userId && !isNaN(userId)) {
                socket.userId = userId;
                socket.join(`user_${userId}`);
                logger.info(`👤 User ${userId} joined room user_${userId}`);

                // Update online status on socket connect.
                // POLICY: If the user's presence was manually set ('manual'), preserve it.
                // Only switch to system-managed if they weren't already manually online.
                try {
                    const pool = connectDB();
                    await pool.query(
                        `UPDATE users 
                         SET is_online = 1,
                             last_heartbeat = NOW(),
                             status        = IF(status_source = 'manual', status, 'available'),
                             status_source = IF(status_source = 'manual', 'manual', 'system')
                         WHERE id = ?`,
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
        // POLICY: Only refresh last_heartbeat. Never overwrite status_source.
        // A manually-online user sending heartbeats must NOT be converted to system-managed.
        socket.on("heartbeat_ack", async (userId) => {
            if (userId && !isNaN(userId)) {
                try {
                    const pool = connectDB();
                    await pool.query(
                        "UPDATE users SET last_heartbeat = NOW() WHERE id = ?",
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
                    // POLICY: Only mark offline if presence was system-managed.
                    // If the user manually toggled online, a socket disconnect must NOT override it.
                    // The background worker handles stale system-presence cleanup independently.
                    try {
                        const pool = connectDB();
                        await pool.query(
                            `UPDATE users 
                             SET is_online = 0, status = 'offline'
                             WHERE id = ? AND status_source = 'system'`,
                            [userId]
                        );
                    } catch (err) { }
                }
            }
        });
    });

    // Background presence worker: Detect ghost agents
    // POLICY:
    //   status_source = 'system'  → Auto-set by socket connect/disconnect.
    //                               Reset to offline if no heartbeat for 90 seconds.
    //   status_source = 'manual'  → Explicitly toggled by the user via the UI.
    //                               NEVER auto-reset. Stays online until the user
    //                               manually toggles off, or reconnects via socket
    //                               (which overwrites it with status_source='system').
    setInterval(async () => {
        try {
            const pool = connectDB();
            // Only clean up stale SYSTEM-sourced presence (socket-driven).
            // Manual presence is intentionally sticky and is NOT touched here.
            await pool.query(
                `UPDATE users 
                 SET is_online = 0, status = 'offline', status_source = 'system' 
                 WHERE is_online = 1 
                   AND status_source = 'system'
                   AND (last_heartbeat < (NOW() - INTERVAL 90 SECOND) OR last_heartbeat IS NULL)
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
