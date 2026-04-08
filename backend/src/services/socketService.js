// src/services/socketService.js
import { Server } from "socket.io";
import { logger } from "../logger.js";
import connectDB from "../db/index.js";
import * as widgetAdapter from "../modules/conversations/adapters/widgetAdapter.js";

let io;

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*", 
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", (socket) => {
        logger.info(`🔌 New socket connection: ${socket.id}`);

        // Join a room based on user ID for targeted notifications (Agents/Admins)
        socket.on("join", async (userId) => {
            if (userId) {
                socket.userId = userId; // Store for disconnect handler
                socket.join(`user_${userId}`);
                logger.info(`👤 User ${userId} joined their notification room.`);

                // Update database: User is now Online
                try {
                    const pool = connectDB();
                    await pool.query('UPDATE users SET is_online = 1 WHERE id = ?', [userId]);
                } catch (err) {
                    logger.error(`[Socket] Failed to update online status for user ${userId}: ${err.message}`);
                }
            }
        });

        // Guest Messaging (Chat Widget)
        socket.on("guest_message", (payload) => {
            widgetAdapter.handleWidgetMessage(socket, payload);
        });

        socket.on("disconnect", async () => {
            logger.info(`🔌 Socket disconnected: ${socket.id}`);
            
            if (socket.userId) {
                try {
                    const userId = socket.userId;
                    // Check if the user has any OTHER active connections left
                    const remainingSockets = await io.in(`user_${userId}`).fetchSockets();
                    
                    if (remainingSockets.length === 0) {
                        logger.info(`👤 User ${userId} is now fully offline.`);
                        const pool = connectDB();
                        await pool.query('UPDATE users SET is_online = 0 WHERE id = ?', [userId]);
                    }
                } catch (err) {
                    logger.error(`[Socket] Failed to update offline status on disconnect: ${err.message}`);
                }
            }
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};

/**
 * Emit a real-time event to a specific user
 */
export const emitToUser = (userId, event, data) => {
    if (io) {
        io.to(`user_${userId}`).emit(event, data);
    }
};

/**
 * Broadcast an event to everyone
 */
export const broadcast = (event, data) => {
    if (io) {
        io.emit(event, data);
    }
};
