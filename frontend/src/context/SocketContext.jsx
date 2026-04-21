// src/context/SocketContext.jsx
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import api from '../api/axios';

export const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [status, setStatus] = useState('connecting'); // connecting, connected, reconnecting, failed
    const [latestSnapshot, setLatestSnapshot] = useState(null); // Persist snapshot data
    const [lastSync, setLastSync] = useState(Date.now());
    const [isOnline, setIsOnline] = useState(false); // Manual presence state
    const [lastSeq, setLastSeq] = useState(0);
    const [emergencyMsg, setEmergencyMsg] = useState(null);
    
    const rehydrating = useRef(false);

    // Initial presence fetch
    useEffect(() => {
        const fetchInitialPresence = async () => {
            try {
                const r = await api.get('/users/presence/me');
                if (r.data.success) {
                    setIsOnline(!!r.data.presence.is_online);
                }
            } catch (err) {
                console.error('[SocketContext] Failed to fetch initial presence:', err);
            }
        };
        const token = localStorage.getItem('token');
        if (token) fetchInitialPresence();
    }, []);

    // Function to fetch full state and sync it
    const rehydrate = useCallback(async () => {
        if (rehydrating.current) return;
        rehydrating.current = true;
        try {
            console.log('🔄 Rehydrating dashboard state...');
            const r = await api.get('/dashboard/monitoring/snapshot');
            if (r.data.success) {
                // Save to context state for persistence across tab switches
                setLatestSnapshot(r.data.snapshot);
                
                // Dispatch event for components to consume
                window.dispatchEvent(new CustomEvent('dashboard_rehydrated', { detail: r.data.snapshot }));
                setLastSync(r.data.snapshot.server_ts);
                console.log('✅ Rehydration complete.');
            }
        } catch (err) {
            console.error('❌ Rehydration failed:', err);
        } finally {
            rehydrating.current = false;
        }
    }, []);

    const togglePresence = useCallback(async (newState) => {
        try {
            const r = await api.post('/users/presence', { 
                is_online: newState,
                status: newState ? 'available' : 'offline'
            });
            if (r.data.success) {
                setIsOnline(newState);
                // Also rehydrate to show the change immediately on dashboard if we are on check center
                rehydrate();
            }
        } catch (err) {
            console.error('[SocketContext] Failed to toggle presence:', err);
        }
    }, [rehydrate]);

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user'));
        const token = localStorage.getItem('token');

        if (user && token) {
            const backendUrl = import.meta.env.VITE_API_BASE?.replace('/api', '');
            const newSocket = io(backendUrl, {
                reconnectionAttempts: 10,
                reconnectionDelay: 2000,
                reconnectionDelayMax: 30000,
                randomizationFactor: 0.5
            });

            newSocket.on('connect', () => {
                console.log('🔌 Connected to WebSocket server');
                setStatus('connected');
                newSocket.emit('join', user.id);
                
                // On initial connect or reconnect, pull snapshot
                rehydrate();
            });

            newSocket.on('disconnect', (reason) => {
                console.warn('🔌 Disconnected:', reason);
                if (reason === 'io server disconnect') {
                    // the disconnection was initiated by the server, you need to reconnect manually
                    newSocket.connect();
                }
                setStatus('reconnecting');
            });

            newSocket.on('connect_error', (error) => {
                console.error('🔌 Connection Error:', error);
                setStatus('reconnecting');
            });

            newSocket.on('reconnect_failed', () => {
                setStatus('failed');
            });

            // Handlers for real-time dashboard updates
            newSocket.on('dashboard_update', (event) => {
                // 1. DEDUPLICATION (UUID) & ORDERING (Sequence)
                if (event.seq <= lastSeq) {
                    console.log(`[Socket] 🛡️ Ignoring late packet (seq: ${event.seq})`);
                    return;
                }
                
                setLastSeq(event.seq);
                setLastSync(Date.now());

                // Dispatch to window so specific UI components can listen without re-rendering everything
                window.dispatchEvent(new CustomEvent('dashboard_packet', { detail: event }));
            });

            // Heartbeat ACK
            const heartbeatTimer = setInterval(() => {
                if (newSocket.connected) {
                    newSocket.emit('heartbeat_ack', user.id);
                }
            }, 30000);

            // Legacy Emergency Handlers
            newSocket.on('emergency_alert', (payload) => setEmergencyMsg(payload));
            newSocket.on('emergency_claimed', (data) => {
                setEmergencyMsg(prev => (prev && prev.ticket_id == data.ticket_id) ? null : prev);
            });

            setSocket(newSocket);

            return () => {
                clearInterval(heartbeatTimer);
                newSocket.close();
            };
        }
    }, [rehydrate]);

    return (
        <SocketContext.Provider value={{ 
            socket, status, lastSync, latestSnapshot, setLatestSnapshot, 
            lastSeq, emergencyMsg, setEmergencyMsg, rehydrate,
            isOnline, togglePresence 
        }}>
            {children}
        </SocketContext.Provider>
    );
};
