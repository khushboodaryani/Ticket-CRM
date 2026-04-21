// src/components/Shared/DashboardStatus.jsx

import { useSocket } from '../../hooks/useSocket';

export default function DashboardStatus() {
    const { status, lastSync, rehydrate } = useSocket();

    const config = {
        connected: { color: '#10b981', label: 'Live', icon: '●' },
        connecting: { color: '#f59e0b', label: 'Connecting...', icon: '◌' },
        reconnecting: { color: '#f59e0b', label: 'Reconnecting...', icon: '◌' },
        failed: { color: '#ef4444', label: 'Offline', icon: '×' },
    };

    const current = config[status] || config.failed;

    return (
        <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 12, 
            padding: '4px 12px', 
            background: 'var(--bg-app)', 
            borderRadius: 20, 
            border: '1px solid var(--border)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-secondary)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: current.color, fontSize: 14 }}>{current.icon}</span>
                <span style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>{current.label}</span>
            </div>
            
            <div style={{ width: 1, height: 12, background: 'var(--border)' }} />
            
            <div style={{ opacity: 0.7 }}>
                Last sync: {new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>

            {status === 'failed' && (
                <button 
                    onClick={rehydrate}
                    style={{ 
                        background: 'var(--accent)', 
                        color: 'white', 
                        border: 'none', 
                        padding: '2px 8px', 
                        borderRadius: 4, 
                        cursor: 'pointer',
                        fontSize: 9,
                        fontWeight: 800
                    }}
                >
                    RETRY
                </button>
            )}
        </div>
    );
}
