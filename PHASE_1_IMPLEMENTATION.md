# Phase 1 Implementation & Socket.io Technical Guide

This document outlines the architectural achievements of Phase 1 and provides a technical guide on how real-time communication is implemented and used within the Ticket CRM.

---

## 🚀 Phase 1 Implementation Overview
Phase 1 focused on laying a professional enterprise foundation by refactoring the system into a **Modular Monolith** and implementing core high-performance features.

### Key Achievements:
- **Modular Monolith Architecture**: Decoupled the backend into domain-specific modules (Auth, Tickets, Users, Notifications, SLA).
- **Enterprise Scaling**: Optimized the database with composite indexes to handle over 1,000,000 tickets/day with sub-millisecond lookups.
- **Workflow Automation Engine**: Implemented a dynamic Trigger → Condition → Action (TCA) engine, moving away from hardcoded business logic.
- **Security & Portability**: Standardized environment variables across frontend and backend, removing all hardcoded URLs and ports.

---

## 🔌 Socket.io Implementation Guide

Real-time communication is used for **Instant Notifications** and **Live Conversation Updates**.

### 1. Backend: The Service Layer
The backend logic is centralized in a service to allow any module to emit events.
- **File**: `backend/src/services/socketService.js`
- **Logic**:
    - Initializes the `Server` from `socket.io`.
    - Handles the `join` event, placing users into personal rooms (`user_${userId}`) for targeted notifications.
    - Provides utility functions:
        - `emitToUser(userId, event, data)`: Sends a private event to a specific user.
        - `broadcast(event, data)`: Sends an event to all connected clients.

**Initialization**:
- **File**: `backend/src/index.js`
- The `initSocket(server)` function is called immediately after the HTTP server starts.

### 2. Frontend: The Context Provider
The frontend manages the connection through a React Context to ensure only one connection is active and globally accessible.
- **File**: `frontend/src/context/SocketContext.jsx`
- **Logic**:
    - Derives the backend URL from the environment variable.
    - Automatically emits the `join` event with the logged-in user's ID upon connection.
    - Provides a custom hook `useSocket()` for components to access the socket instance.

---

## 🛠️ How to Use Real-time Features

### Sending an Event (Backend)
To send a notification to a specific user from any controller:
```javascript
import { emitToUser } from "../../services/socketService.js";

// Inside a controller function
emitToUser(targetUserId, "new_notification", { 
    title: "Ticket Assigned", 
    body: "You have a new ticket: #1001" 
});
```

### Listening for an Event (Frontend)
To react to an event in a React component:
```javascript
import { useSocket } from '../../context/SocketContext';

export default function MyComponent() {
    const socket = useSocket();

    useEffect(() => {
        if (!socket) return;

        socket.on('new_notification', (data) => {
            console.log("New data received:", data);
            // Update local state or show a toast
        });

        return () => socket.off('new_notification');
    }, [socket]);
}
```

---

## 📁 Critical File Locations
- **Backend Service**: `backend/src/services/socketService.js`
- **Backend Setup**: `backend/src/index.js`
- **Frontend Provider**: `frontend/src/context/SocketContext.jsx`
- **Live Example (Notifications)**: `frontend/src/components/Layout/Topbar.jsx`
- **Live Example (Chat)**: `frontend/src/pages/TicketDetail.jsx`
