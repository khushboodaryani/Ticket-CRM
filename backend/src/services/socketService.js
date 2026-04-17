// src/services/socketService.js
// LEGACY WRAPPER: Forwards all calls to the new socketServer.js
// This ensures that existing dynamic imports across the app don't break.

import { initSocket, getIO, emitToUser, broadcast } from "./socketServer.js";

export {
    initSocket,
    getIO,
    emitToUser,
    broadcast
};
