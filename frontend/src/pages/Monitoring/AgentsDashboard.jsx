// src/pages/Monitoring/AgentsDashboard.jsx
import { useState, useEffect } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { useNavigate } from 'react-router-dom';
import Topbar from '../../components/Layout/Topbar';
import DashboardStatus from '../../components/Shared/DashboardStatus';

const STATUS_COLORS = {
    offline: '#ef4444',
    online: '#10b981'
};

export default function AgentsDashboard() {
    const { latestSnapshot } = useSocket();
    const navigate = useNavigate();
    const [agents, setAgents] = useState(latestSnapshot?.agents || []);
    const [filters, setFilters] = useState({ name: '', status: '' });

    useEffect(() => {
        const handleRehydrate = (e) => setAgents(e.detail.agents || []);
        const handlePacket = (e) => {
            if (e.detail.type === 'AGENT_STATUS_CHANGE') {
                const { userId, status } = e.detail.data;
                setAgents(prev => prev.map(a => a.id == userId ? { ...a, status, is_online: status !== 'offline' ? 1 : 0 } : a));
            }
        };

        window.addEventListener('dashboard_rehydrated', handleRehydrate);
        window.addEventListener('dashboard_packet', handlePacket);
        return () => {
            window.removeEventListener('dashboard_rehydrated', handleRehydrate);
            window.removeEventListener('dashboard_packet', handlePacket);
        };
    }, []);

    const filteredAgents = agents.filter(a => {
        if (filters.name && !a.name?.toLowerCase().includes(filters.name.toLowerCase())) return false;
        if (filters.status && (a.status || 'offline') !== filters.status) return false;
        return true;
    });

    return (
        <>
            <Topbar title="Agent Live Performance" subtitle={<DashboardStatus />} />
            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                
                {/* ROSTER FILTERS */}
                <div style={{ 
                    background: 'var(--bg-card)', 
                    padding: '12px 20px', 
                    borderRadius: 16, 
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12
                }}>
                    <input 
                        type="text" 
                        placeholder="Search agent name..."
                        className="form-control"
                        style={{ flex: 1, background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 10, height: 40, fontSize: 13 }}
                        value={filters.name}
                        onChange={e => setFilters(f => ({ ...f, name: e.target.value }))}
                    />
                    <select 
                        className="form-control" 
                        style={{ width: 160, background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 10, height: 40, fontSize: 13, fontWeight: 700 }}
                        value={filters.status}
                        onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                    >
                        <option value="">All Statuses</option>
                        {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                    </select>
                </div>

                <div className="card">
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Agent Name</th>
                                    <th>Current Status</th>
                                    <th>Daily Health</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAgents.map(a => (
                                    <tr key={a.id} onClick={() => navigate(`/monitoring/agent/${a.id}`)} style={{ cursor: 'pointer' }}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div className={a.is_online ? 'pulse-online' : ''} style={{ 
                                                    width: 10, height: 10, borderRadius: '50%', background: a.is_online ? '#10b981' : '#6b7280' 
                                                }} />
                                                <div style={{ fontWeight: 700 }}>{a.name}</div>
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{ 
                                                padding: '6px 14px', 
                                                borderRadius: 20, 
                                                fontSize: 10, 
                                                fontWeight: 800, 
                                                textTransform: 'uppercase', 
                                                background: `${STATUS_COLORS[a.is_online ? 'online' : 'offline'] || '#6b7280'}20`,
                                                color: STATUS_COLORS[a.is_online ? 'online' : 'offline'] || '#6b7280',
                                                border: `1px solid ${STATUS_COLORS[a.is_online ? 'online' : 'offline'] || '#6b7280'}30`
                                            }}>
                                                {a.is_online ? 'ONLINE' : 'OFFLINE'}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: a.is_online ? '#10b981' : 'var(--text-muted)' }}>
                                                {a.is_online ? 'CONNECTED' : 'DISCONNECTED'}
                                            </div>
                                        </td>
                                        <td>
                                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, fontWeight: 800 }}>VIEW PORTAL →</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredAgents.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontWeight: 600 }}>No matching agents found</div>}
                    </div>
                </div>
            </div>
        </>
    );
}
