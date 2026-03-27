import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'
import { useTheme } from '../../context/ThemeContext'
import axios from '../../api/axios'

export default function Topbar({ title, subtitle, actions }) {
    const { user } = useAuth()
    const { theme, toggleTheme } = useTheme()
    const { socket, emergencyMsg, setEmergencyMsg } = useSocket() || {}
    const navigate = useNavigate()
    const [notifications, setNotifications] = useState([])
    const [unread, setUnread] = useState(0)
    const [showBell, setShowBell] = useState(false)
    const bellRef = useRef(null)

    const fetchNotifications = async () => {
        try {
            const r = await axios.get('/notifications')
            setNotifications(r.data.notifications?.slice(0, 5) || [])
            setUnread(r.data.unread_count || 0)
        } catch { }
    }

    useEffect(() => {
        fetchNotifications()
    }, [])

    useEffect(() => {
        if (!socket) return;

        const handleNotification = (notif) => {
            setNotifications(prev => [notif, ...prev].slice(0, 5));
            setUnread(prev => prev + 1);
        };

        socket.on('new_notification', handleNotification);

        return () => {
            socket.off('new_notification', handleNotification);
        };
    }, [socket])

    useEffect(() => {
        const handleClick = (e) => { if (bellRef.current && !bellRef.current.contains(e.target)) setShowBell(false) }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    const markAllRead = async () => {
        try { await axios.put('/notifications/read-all'); fetchNotifications() } catch { }
    }

    return (
        <div className="topbar">
            {emergencyMsg && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999999,
                    background: 'rgba(0, 0, 0, 0.55)', backdropFilter: 'blur(16px) saturate(1.5)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                    color: 'white', textAlign: 'center', padding: '2rem', animation: 'fadeIn 0.2s ease-out'
                }}>
                    <div style={{
                        background: '#ffffff', color: '#dc2626', padding: '3rem', borderRadius: '1rem',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', maxWidth: '600px', width: '100%'
                    }}>
                        <div style={{ fontSize: '4rem', marginBottom: '1rem', animation: 'pulse 1.5s infinite' }}>🚨</div>
                        <h2 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 900, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            CRITICAL EMERGENCY
                        </h2>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, marginBottom: '2rem', color: '#1f2937' }}>
                            {emergencyMsg.message || 'SYSTEM OUTAGE DETECTED'}
                        </h3>

                        <div style={{ background: '#fef2f2', border: '2px solid #fecaca', borderRadius: '0.5rem', padding: '1.5rem', marginBottom: '2rem', textAlign: 'left' }}>
                            <p style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: '#7f1d1d' }}><strong>Ticket:</strong> {emergencyMsg.ticket_number}</p>
                            <p style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: '#7f1d1d' }}><strong>Category:</strong> {emergencyMsg.category}</p>
                            <p style={{ margin: 0, fontSize: '1.1rem', color: '#7f1d1d' }}><strong>Priority:</strong> {emergencyMsg.priority}</p>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <button
                                onClick={async () => {
                                    if (emergencyMsg.ticket_id) {
                                        navigate(`/tickets/${emergencyMsg.ticket_id}`);
                                    }
                                    setEmergencyMsg(null);
                                }}
                                style={{
                                    background: '#dc2626', color: 'white', border: 'none', padding: '1rem 2.5rem',
                                    borderRadius: '0.5rem', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer',
                                    boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.4)'
                                }}
                            >
                                VIEW & CLAIM TICKET
                            </button>
                            <button
                                onClick={() => setEmergencyMsg(null)}
                                style={{
                                    background: 'transparent', color: '#6b7280', border: '2px solid #e5e7eb',
                                    padding: '1rem 2rem', borderRadius: '0.5rem', fontSize: '1.1rem', fontWeight: 700, cursor: 'pointer'
                                }}
                            >
                                DISMISS
                            </button>
                        </div>
                    </div>
                    <style>{`
                        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.15); } 100% { transform: scale(1); } }
                        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                    `}</style>
                </div>
            )}

            <div style={{ flex: 1 }}>
                <h1 className="topbar-title">{title}</h1>
                {subtitle && <p className="topbar-sub">{subtitle}</p>}
            </div>

            <div className="topbar-actions">
                {actions}
                {/* Notification Bell */}
                <div ref={bellRef} style={{ position: 'relative' }}>
                    <button
                        className="theme-toggle"
                        onClick={() => setShowBell(p => !p)}
                        title="Notifications"
                        style={{ position: 'relative' }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                        {unread > 0 && (
                            <span style={{
                                position: 'absolute', top: -4, right: -4,
                                background: '#ef4444', color: '#fff',
                                fontSize: 10, fontWeight: 700,
                                borderRadius: '50%', width: 16, height: 16,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                lineHeight: 1
                            }}>{unread > 9 ? '9+' : unread}</span>
                        )}
                    </button>
                    {showBell && (
                        <div style={{
                            position: 'absolute', top: 44, right: 0,
                            width: 320, background: 'var(--bg-card)',
                            border: '1px solid var(--border)', borderRadius: 12,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 1000,
                            overflow: 'hidden'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>Notifications</span>
                                {unread > 0 && <button onClick={markAllRead} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Mark all read</button>}
                            </div>
                            {notifications.length === 0 ? (
                                <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)' }}>No notifications</div>
                            ) : (
                                notifications.map(n => (
                                    <div key={n.id} onClick={() => { if (n.entity_id) navigate(`/tickets/${n.entity_id}`); setShowBell(false) }} style={{
                                        padding: '10px 14px', cursor: n.entity_id ? 'pointer' : 'default',
                                        background: n.is_read ? 'transparent' : 'var(--accent-subtle)',
                                        borderBottom: '1px solid var(--border)',
                                        transition: 'background 0.15s'
                                    }}>
                                        <div style={{ fontWeight: 500, fontSize: 12, color: 'var(--text-primary)' }}>{n.title}</div>
                                        {n.body && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{n.body}</div>}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
                <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
                    {theme === 'dark' ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                        </svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                        </svg>
                    )}
                </button>
            </div>

            <style>{`
        .topbar-actions { display: flex; align-items: center; gap: 12px; }
        .theme-toggle {
          width: 36px; height: 36px;
          border-radius: 50%;
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-secondary);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .theme-toggle:hover {
          background: var(--bg-card-hover);
          color: var(--accent);
          border-color: var(--accent);
          transform: rotate(15deg);
        }
      `}</style>
        </div>
    )
}
