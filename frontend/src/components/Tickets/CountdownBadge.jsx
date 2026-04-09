// src/components/Tickets/CountdownBadge.jsx
import { useState, useEffect } from 'react';

export default function CountdownBadge({ etr, paused, status, sla_state }) {
    const [timeLeft, setTimeLeft] = useState('');
    const [badgeStatus, setBadgeStatus] = useState('safe'); 

    useEffect(() => {
        if (!etr) return;

        // If ticket is resolved or closed, we show the final result
        if (['resolved', 'closed'].includes(status)) {
            if (sla_state === 'breached') {
                setTimeLeft('SLA Breached');
                setBadgeStatus('overdue');
            } else {
                setTimeLeft('SLA Met');
                setBadgeStatus('met');
            }
            return;
        }

        if (paused) {
            setTimeLeft('Paused');
            setBadgeStatus('paused');
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
                setBadgeStatus('overdue');
            } else {
                const hrs = Math.floor(diffMs / 3600000);
                const mins = Math.floor((diffMs % 3600000) / 60000);
                if (hrs === 0 && mins < 30) {
                     setBadgeStatus('warning');
                } else {
                     setBadgeStatus('safe');
                }
                setTimeLeft(`${hrs > 0 ? `${hrs}h ` : ''}${mins}m left`);
            }
        };

        tick();
        const timer = setInterval(tick, 60000); 
        return () => clearInterval(timer);
    }, [etr, paused, status, sla_state]);

    const styles = {
        safe: { background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.2)' },
        met: { background: '#22c55e', color: '#ffffff', border: '1px solid #16a34a' },
        warning: { background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.2)' },
        overdue: { background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' },
        paused: { background: 'rgba(107, 114, 128, 0.1)', color: '#6b7280', border: '1px solid rgba(107, 114, 128, 0.2)' }
    };

    if (!etr) return <span style={{ color: 'var(--text-muted)' }}>—</span>;

    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            whiteSpace: 'nowrap',
            ...styles[badgeStatus]
        }}>
            {badgeStatus === 'overdue' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
            {badgeStatus === 'met' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
            {timeLeft}
        </span>
    );
}
