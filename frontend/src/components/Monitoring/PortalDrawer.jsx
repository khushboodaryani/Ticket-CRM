// src/components/Monitoring/PortalDrawer.jsx


export default function PortalDrawer({ isOpen, onClose, title, subtitle, children }) {
    if (!isOpen) return null;

    return (
        <div style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            width: '100vw', 
            height: '100vh', 
            zIndex: 1000, 
            display: 'flex', 
            justifyContent: 'flex-end',
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            transition: 'all 0.3s'
        }} onClick={onClose}>
            <div 
                style={{ 
                    width: 'min(500px, 90vw)', 
                    height: '100%', 
                    background: 'var(--bg-card)', 
                    borderLeft: '1px solid var(--border)',
                    boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'slideIn 0.3s ease-out'
                }} 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ 
                    padding: '24px 32px', 
                    borderBottom: '1px solid var(--border)', 
                    background: 'linear-gradient(to right, var(--bg-surface), var(--bg-card))' 
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>×</button>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{subtitle}</div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
                    {children}
                </div>

                {/* Footer */}
                <div style={{ padding: 24, borderTop: '1px solid var(--border)', textAlign: 'right', background: 'var(--bg-app)' }}>
                    <button className="btn btn-secondary btn-sm" onClick={onClose}>Close Portal</button>
                </div>
            </div>

            <style>{`
                @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
            `}</style>
        </div>
    );
}
