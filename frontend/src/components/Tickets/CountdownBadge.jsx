// src/components/Tickets/CountdownBadge.jsx
import { useState, useEffect } from 'react';

export default function CountdownBadge({ etr, paused }) {
    const [timeLeft, setTimeLeft] = useState('');
    const [status, setStatus] = useState('safe'); 

    useEffect(() => {
        if (!etr) return;
        if (paused) {
            setTimeLeft('Paused');
            setStatus('paused');
            return;
        }

        const tick = () => {
            const now = new Date();
            const deadline = new Date(etr);
            const diffMs = deadline - now;

            if (diffMs < 0) {
                const absDiff = Math.abs(diffMs);
                const hrs = Math.floor(absDiff / 3600000);
                const mins = Math.floor((absDiff % 3600000) / 60000);
                setTimeLeft(`Breached ${hrs > 0 ? `${hrs}h ` : ''}${mins}m ago`);
                setStatus('overdue');
            } else {
                const hrs = Math.floor(diffMs / 3600000);
                const mins = Math.floor((diffMs % 3600000) / 60000);
                if (hrs === 0 && mins < 30) {
                     setStatus('warning');
                } else {
                     setStatus('safe');
                }
                setTimeLeft(`${hrs > 0 ? `${hrs}h ` : ''}${mins}m left`);
            }
        };

        tick();
        const timer = setInterval(tick, 60000); 
        return () => clearInterval(timer);
    }, [etr, paused]);

    const styles = {
        safe: { background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.2)' },
        warning: { background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.2)' },
        overdue: { background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' },
        paused: { background: 'rgba(107, 114, 128, 0.1)', color: '#6b7280', border: '1px solid rgba(107, 114, 128, 0.2)' }
    };

    if (!etr) return <span style={{ color: 'var(--text-muted)' }}>—</span>;

    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
            whiteSpace: 'nowrap',
            ...styles[status]
        }}>
            {status === 'overdue' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
            {timeLeft}
        </span>
    );
}
