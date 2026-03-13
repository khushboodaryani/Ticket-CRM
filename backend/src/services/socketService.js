// src/services/socketService.js
import { Server } from "socket.io";
import { logger } from "../logger.js";
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
        socket.on("join", (userId) => {
            if (userId) {
                socket.join(`user_${userId}`);
                logger.info(`👤 User ${userId} joined their notification room.`);
            }
        });

        // Guest Messaging (Chat Widget)
        socket.on("guest_message", (payload) => {
            widgetAdapter.handleWidgetMessage(socket, payload);
        });

        socket.on("disconnect", () => {
            logger.info(`🔌 Socket disconnected: ${socket.id}`);
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
