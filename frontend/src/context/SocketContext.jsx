import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);

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

            setSocket(newSocket);

            return () => {
                newSocket.close();
            };
        }
    }, []);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};
