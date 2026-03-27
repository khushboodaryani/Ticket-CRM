import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

/**
 * Hook to access the global emergency message state.
 * This state persists across page navigations because it lives in the SocketProvider.
 */
export const useEmergency = () => {
    const ctx = useContext(SocketContext);
    // Return dummy values if context is not available (shouldn't happen)
    if (!ctx || typeof ctx === 'object' && ctx.socket !== undefined) {
        // New shape — return correctly
    }
    return ctx;
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [emergencyMsg, setEmergencyMsg] = useState(null);

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user'));
        const token = localStorage.getItem('token');

        if (user && token) {
            // Derive backend URL from API base (remove /api suffix)
            const backendUrl = import.meta.env.VITE_API_BASE?.replace('/api', '');
            const newSocket = io(backendUrl);

            newSocket.on('connect', () => {
                console.log('🔌 Connected to WebSocket server');
                // Join personal room based on userId
                newSocket.emit('join', user.id);
            });

            // Listen for emergency alerts at the CONTEXT level so they persist across navigations
            newSocket.on('emergency_alert', (payload) => {
                console.log("🚨 EMERGENCY ALERT RECEIVED (SocketContext):", payload);
                setEmergencyMsg(payload);
            });

            newSocket.on('emergency_claimed', (data) => {
                setEmergencyMsg(prev => {
                    if (prev && prev.ticket_id == data.ticket_id) {
                        return null; // Someone else claimed it, hide the banner
                    }
                    return prev;
                });
            });

            setSocket(newSocket);

            return () => {
                newSocket.close();
            };
        }
    }, []);

    return (
        <SocketContext.Provider value={{ socket, emergencyMsg, setEmergencyMsg }}>
            {children}
        </SocketContext.Provider>
    );
};
