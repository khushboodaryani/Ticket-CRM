// src/components/Monitoring/AgentDetailView.jsx
import { useState, useEffect } from 'react';
import api from '../../api/axios';
import DashboardView from '../Dashboard/DashboardView';

export default function AgentDetailView({ agentId }) {
    const [agent, setAgent] = useState(null);

    useEffect(() => {
        if (!agentId) return;
        // Fetch basic agent info for the header
        api.get(`/dashboard/monitoring/agent/${agentId}`)
            .then(res => setAgent(res.data.agent))
            .catch(console.error);
    }, [agentId]);

    if (!agent) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Fetching Agent Session...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Header / Info */}
            <div style={{ textAlign: 'center', background: 'var(--bg-app)', padding: '24px 32px', borderRadius: 20, border: '1px solid var(--border)' }}>
                <div style={{ 
                    width: 50, height: 50, borderRadius: '50%', background: 'var(--accent)', 
                    color: 'white', fontSize: 20, fontWeight: 800, margin: '0 auto 12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    {agent.name?.charAt(0)}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{agent.name} Dashboard</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>
                    Extension: {agent.extension || '---'} • Status: <span style={{ fontWeight: 800, color: agent.is_online ? '#10b981' : '#ef4444' }}>{agent.is_online ? 'ONLINE' : 'OFFLINE'}</span>
                </div>
            </div>

            {/* Impersonated Dashboard View */}
            <DashboardView targetUserId={agentId} isPortal={true} />
        </div>
    );
}
