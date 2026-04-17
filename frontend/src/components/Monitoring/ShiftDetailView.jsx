// src/components/Monitoring/ShiftDetailView.jsx
import { useState, useEffect } from 'react';
import api from '../../api/axios';
import DashboardView from '../Dashboard/DashboardView';

export default function ShiftDetailView({ shiftId }) {
    const [shiftInfo, setShiftInfo] = useState(null);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!shiftId) return;
        setLoading(true);
        // Fetch roster + current load
        api.get(`/dashboard/monitoring/shift/${shiftId}`)
            .then(res => setMembers(res.data.members))
            .catch(console.error);

        // Fetch shift basic info (if we had a specific endpoint for it, but for now we'll label it by ID)
        setShiftInfo({ id: shiftId });
        setLoading(false);
    }, [shiftId]);

    if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Calculating Shift Manpower...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
             {/* Shift Team Summary */}
             <div style={{ background: 'var(--bg-app)', padding: '24px', borderRadius: 20, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Shift Team Performance</div>
                <DashboardView targetShiftId={shiftId} isPortal={true} />
            </div>

            {/* Live Roster Section */}
            <section>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
                    Live Roster • {members.length} Agents
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {members.map(m => (
                        <div key={m.id} style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            background: 'var(--bg-surface)', 
                            padding: '12px 16px', 
                            borderRadius: 16, 
                            border: '1px solid var(--border-subtle)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ 
                                    width: 8, height: 8, borderRadius: '50%', 
                                    background: m.is_online ? '#10b981' : 'var(--border)' 
                                }} />
                                <span style={{ fontWeight: 700, fontSize: 13 }}>{m.name}</span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 10, fontWeight: 800, color: m.active_tickets > 5 ? '#ef4444' : 'var(--accent)' }}>
                                    {m.active_tickets} active
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
