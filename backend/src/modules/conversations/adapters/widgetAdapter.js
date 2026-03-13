// src/modules/conversations/adapters/widgetAdapter.js
import { handleInbound } from "../../../services/messagingService.js";
import { emitToUser } from "../../../services/socketService.js";
import { logger } from "../../../logger.js";

/**
 * Adapter for the Web Chat Widget.
 * Translates Socket.io events into standardized messaging events.
 */

export const handleWidgetMessage = async (socket, payload) => {
    try {
        const { senderId, senderName, body, attachments } = payload;
        
        // Standardize and send to messagingService
        await handleInbound({
            channel: 'chat',
            senderId,
            senderName,
            body,
            attachments,
            metadata: { socketId: socket.id }
        });

        // Acknowledge back to the guest
        socket.emit('message_received', { success: true, timestamp: new Date() });

    } catch (err) {
        logger.error("❌ widgetAdapter error:", err.message);
        socket.emit('error', { message: "Failed to send message" });
    }
};

/**
 * Outbound: Send a message back to the guest via Socket.io
 */
export const send = async (guestId, messageData) => {
    // Emit specifically to the guest's room
    emitToUser(guestId, 'agent_reply', { 
        message: messageData.message, 
        timestamp: new Date() 
    }); 
};
