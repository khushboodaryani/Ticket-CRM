import React from 'react';
import { useSocket } from '../../hooks/useSocket';

const PresenceToggle = () => {
    const { isOnline, togglePresence } = useSocket();

    const colors = {
        bg: 'rgba(31, 41, 55, 0.4)',
        border: 'rgba(55, 65, 81, 0.5)',
        online: '#4ade80',
        offline: '#9ca3af',
        onlineShadow: 'rgba(74, 222, 128, 0.5)',
        offlineShadow: 'rgba(156, 163, 175, 0.2)'
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            backgroundColor: colors.bg,
            borderRadius: '8px',
            border: `1px solid ${colors.border}`,
            transition: 'all 0.3s'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: isOnline ? colors.online : colors.offline,
                    boxShadow: `0 0 8px ${isOnline ? colors.onlineShadow : colors.offlineShadow}`,
                    transition: 'all 0.3s'
                }} />
                <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    color: isOnline ? colors.online : colors.offline,
                    transition: 'color 0.3s'
                }}>
                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                </span>
            </div>
            
            <button
                onClick={() => togglePresence(!isOnline)}
                style={{
                    position: 'relative',
                    display: 'inline-flex',
                    height: '18px',
                    width: '34px',
                    cursor: 'pointer',
                    alignItems: 'center',
                    borderRadius: '9999px',
                    border: 'none',
                    backgroundColor: isOnline ? 'rgba(34, 197, 94, 0.8)' : '#4b5563',
                    transition: 'background-color 0.3s',
                    outline: 'none',
                    padding: 0
                }}
            >
                <span
                    style={{
                        display: 'inline-block',
                        height: '14px',
                        width: '14px',
                        borderRadius: '50%',
                        backgroundColor: 'white',
                        transition: 'transform 0.3s',
                        transform: isOnline ? 'translateX(17px)' : 'translateX(3px)'
                    }}
                />
            </button>
        </div>
    );
};

export default PresenceToggle;
