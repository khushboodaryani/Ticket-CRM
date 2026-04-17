// src/pages/Monitoring/QueuesDashboard.jsx
import { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import Topbar from '../../components/Layout/Topbar';
import DashboardStatus from '../../components/Shared/DashboardStatus';

export default function QueuesDashboard() {
    const { latestSnapshot } = useSocket();
    const navigate = useNavigate();
    const [queues, setQueues] = useState(latestSnapshot?.queues || []);

    useEffect(() => {
        const handleRehydrate = (e) => setQueues(e.detail.queues || []);
        const handlePacket = (e) => {
            if (e.detail.type === 'TICKET_CREATED') {
                const ticket = e.detail.data;
                setQueues(prev => prev.map(q => 
                    q.id == ticket.queue_id 
                    ? { ...q, active_tickets: (parseInt(q.active_tickets) || 0) + 1, total_tickets: (parseInt(q.total_tickets) || 0) + 1 }
                    : q
                ));
            }
        };

        window.addEventListener('dashboard_rehydrated', handleRehydrate);
        window.addEventListener('dashboard_packet', handlePacket);
        return () => {
            window.removeEventListener('dashboard_rehydrated', handleRehydrate);
            window.removeEventListener('dashboard_packet', handlePacket);
        };
    }, []);

    return (
        <>
            <Topbar title="Queue Health Monitor" subtitle={<DashboardStatus />} />
            <div className="page-body">
                <div className="grid-3">
                    {queues.map(q => {
                        const sl = Math.round(((q.within_sla || 0) / (Math.max(1, q.total_tickets))) * 100);
                        return (
                            <div 
                                key={q.id} 
                                onClick={() => navigate(`/monitoring/queue/${q.id}`)}
                                className={`card monitoring-card ${q.health !== 'healthy' ? 'risk-pulse' : ''}`} 
                                style={{ 
                                    padding: 24, 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    gap: 16, 
                                    cursor: 'pointer',
                                    borderTop: `4px solid ${q.health === 'critical' ? '#ef4444' : (q.health === 'warning' ? '#f59e0b' : '#10b981')}`
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 800, fontSize: 16 }}>{q.name}</div>
                                        <div style={{ fontSize: 9, fontWeight: 800, color: q.health === 'critical' ? '#ef4444' : 'var(--text-muted)', textTransform: 'uppercase', marginTop: 2 }}>
                                            Status: {q.health.toUpperCase()}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 10, fontWeight: 800, color: sl > 80 ? '#10b981' : '#f59e0b', background: 'var(--bg-app)', padding: '4px 10px', borderRadius: 12, border: '1px solid var(--border)' }}>
                                        {sl}% SL
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div style={{ background: 'var(--bg-app)', padding: 16, borderRadius: 16, border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800 }}>In Queue</div>
                                        <div style={{ fontSize: 24, fontWeight: 800 }}>{q.active_tickets || 0}</div>
                                    </div>
                                    <div style={{ background: 'var(--bg-app)', padding: 16, borderRadius: 16, border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800 }}>Staffing</div>
                                        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>{q.agent_count || 0}</div>
                                    </div>
                                </div>

                                <div style={{ width: '100%', height: 6, background: 'var(--bg-app)', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ width: `${sl}%`, height: '100%', background: sl > 80 ? '#10b981' : sl > 50 ? '#f59e0b' : '#ef4444', transition: 'width 1s ease' }} />
                                </div>
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', fontWeight: 800 }}>CLICK TO OPEN QUEUE PORTAL →</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
