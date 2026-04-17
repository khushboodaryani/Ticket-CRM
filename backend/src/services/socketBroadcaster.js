// src/services/socketBroadcaster.js
import { getIO } from "./socketServer.js";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../logger.js";

let sequenceId = Date.now(); // Start sequence from a high number

/**
 * Enhanced broadcaster that adds metadata for idempotency and ordering.
 * @param {string} room - Room to broadcast to (e.g. 'monitoring_headquarters')
 * @param {string} type - Event type (e.g. 'stats_update')
 * @param {object} payload - The actual data
 */
export const broadcastEvent = (room, type, payload) => {
    try {
        const io = getIO();
        const event = {
            id: uuidv4(), // For deduplication
            seq: ++sequenceId, // For ordering
            ts: Date.now(), // Server timestamp
            type,
            data: payload
        };

        if (room) {
            io.to(room).emit("dashboard_update", event);
        } else {
            io.emit("dashboard_update", event);
        }

        logger.debug(`[Broadcaster] 📢 Event ${type} (seq: ${event.seq}) emitted to ${room || 'everyone'}`);
    } catch (err) {
        logger.error(`[Broadcaster] ⚠️ Failed to emit event: ${err.message}`);
    }
};

/**
 * Specialized broadcasters for common CRM events
 */

export const notifyTicketCreated = (ticket) => {
    broadcastEvent("monitoring_headquarters", "TICKET_CREATED", ticket);
    broadcastEvent(`queue_${ticket.queue_id}`, "TICKET_CREATED", ticket);
};

export const notifyAgentStatusChange = (userId, status, source = 'manual') => {
    broadcastEvent("monitoring_agents", "AGENT_STATUS_CHANGE", { userId, status, source });
};

export const notifySLABreach = (ticketId, queueId, details) => {
    broadcastEvent("monitoring_headquarters", "SLA_BREACH", { ticketId, details });
    broadcastEvent(`queue_${queueId}`, "SLA_BREACH", { ticketId, details });
};
