// src/components/Monitoring/QueueDetailView.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';

export default function QueueDetailView({ queueId }) {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ agents: [], tickets: [] });
    const [filters, setFilters] = useState({ search: '', status: '', priority: '', agentId: '', level: '', source: '', category: '' });

    useEffect(() => {
        if (!queueId) return;
        setLoading(true);
        api.get(`/dashboard/monitoring/queue/${queueId}`)
            .then(res => setData(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [queueId]);

    const filterOptions = {
        sources: [...new Set((data.tickets || []).map(t => t.source).filter(Boolean))],
        categories: [...new Set((data.tickets || []).map(t => t.category).filter(Boolean))],
        levels: [...new Set((data.tickets || []).map(t => t.level).filter(Boolean))].sort(),
        statuses: [...new Set((data.tickets || []).map(t => t.status).filter(Boolean))],
        priorities: [...new Set((data.tickets || []).map(t => t.priority).filter(Boolean))].sort()
    };

    const filteredTickets = (data.tickets || []).filter(t => {
        if (filters.search && !t.ticket_number?.toLowerCase().includes(filters.search.toLowerCase()) && !t.subject?.toLowerCase().includes(filters.search.toLowerCase()) && !t.customer_name?.toLowerCase().includes(filters.search.toLowerCase())) return false;
        if (filters.status && t.status !== filters.status) return false;
        if (filters.priority && t.priority !== filters.priority) return false;
        if (filters.agentId && String(t.assigned_to) !== String(filters.agentId)) return false;
        if (filters.level && String(t.level) !== String(filters.level)) return false;
        if (filters.source && t.source !== filters.source) return false;
        if (filters.category && t.category !== filters.category) return false;
        return true;
    });

    if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Synchronizing Queue Data...</div>;

    const hasFilters = Object.values(filters).some(v => v !== '');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {/* Live Agents Section */}
            <section>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
                    Live Roster • {data.agents.filter(a => a.is_online).length} Online
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {data.agents.map(a => (
                        <div key={a.id} onClick={() => navigate(`/monitoring/agent/${a.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-app)', padding: '8px 14px', borderRadius: 12, border: '1px solid var(--border)', cursor: 'pointer' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.is_online ? '#10b981' : '#6b7280' }} />
                            <span style={{ fontWeight: 700, fontSize: 12 }}>{a.name}</span>
                        </div>
                    ))}
                    {data.agents.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No agents assigned to this queue</div>}
                </div>
            </section>

            {/* Active Tickets Section */}
            <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Active Traffic • {filteredTickets.length} Items
                    </div>
                </div>

                {/* ADVANCED MINI MEGA-FILTER BAR */}
                <div style={{ 
                    background: 'var(--bg-card)', padding: '16px', borderRadius: 20, border: '1px solid var(--border)', marginBottom: 24,
                    display: 'flex', flexDirection: 'column', gap: 12, boxShadow: 'var(--shadow-sm)'
                }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input 
                            type="text" 
                            placeholder="Search tickets, customers..." 
                            style={{ flex: 1.5, background: 'var(--bg-app)', border: '1px solid var(--border)', padding: '10px 16px', borderRadius: 12, fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}
                            value={filters.search}
                            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                        />
                        
                        <select className="mini-filter" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
                            <option value="">All Status</option>
                            {(filterOptions.statuses || []).map(s => <option key={s} value={s}>{(s || '').replace('_', ' ').toUpperCase()}</option>)}
                        </select>

                        <select className="mini-filter" value={filters.priority} onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}>
                            <option value="">Priority</option>
                            {filterOptions.priorities.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>

                        <select className="mini-filter" value={filters.agentId} onChange={e => setFilters(f => ({ ...f, agentId: e.target.value }))}>
                            <option value="">Agent</option>
                            {data.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                        <select className="mini-filter" value={filters.level} onChange={e => setFilters(f => ({ ...f, level: e.target.value }))}>
                            <option value="">Level</option>
                            {filterOptions.levels.map(l => <option key={l} value={l}>L{l}</option>)}
                        </select>

                        <select className="mini-filter" value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))}>
                            <option value="">Source</option>
                            {filterOptions.sources.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                        </select>

                        <select className="mini-filter" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
                            <option value="">Category</option>
                            {filterOptions.categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>

                        <div style={{ flex: 1 }} />

                        {hasFilters && (
                            <button 
                                onClick={() => setFilters({ search: '', status: '', priority: '', agentId: '', level: '', source: '', category: '' })}
                                style={{ background: 'transparent', border: 'none', color: '#ef4444', fontWeight: 800, cursor: 'pointer', fontSize: 10, padding: '0 8px' }}
                            >
                                RESET ALL
                            </button>
                        )}
                    </div>
                </div>

                <style>{`
                    .mini-filter {
                        flex: 1; height: 38px; border-radius: 10px; background: var(--bg-app); border: 1px solid var(--border);
                        padding: 0 10px; font-size: 11px; font-weight: 700; color: var(--text-primary); cursor: pointer;
                    }
                `}</style>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {filteredTickets.map(t => (
                        <div 
                            key={t.id} 
                            onClick={() => navigate(`/tickets/${t.id}`)}
                            className="card monitoring-card"
                            style={{ 
                                background: 'var(--bg-card)', 
                                padding: '16px 20px', 
                                borderRadius: 16, 
                                border: '1px solid var(--border)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 12
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontWeight: 800, fontSize: 11, color: 'var(--accent)' }}>#{t.ticket_number}</span>
                                    <span className={`badge badge-${(t.priority || 'p3').toLowerCase()}`} style={{ scale: 0.7 }}>{t.priority || 'P3'}</span>
                                </div>
                                <div style={{ fontSize: 10, fontWeight: 800, background: 'var(--bg-app)', padding: '4px 10px', borderRadius: 12, border: '1px solid var(--border)' }}>
                                    {t.etr ? new Date(t.etr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No SLA'}
                                </div>
                            </div>
                            
                            <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.subject}>
                                {t.subject || 'No Subject Provided'}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>ASSIGNED TO:</span>
                                    <span style={{ 
                                        fontSize: 11, 
                                        fontWeight: 800, 
                                        color: t.assigned_to_name ? 'var(--accent)' : '#ef4444'
                                    }}>
                                        {t.assigned_to_name?.toUpperCase() || '⚠️ UNASSIGNED'}
                                    </span>
                                </div>
                                <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)' }}>
                                    CLICK TO VIEW →
                                </div>
                            </div>
                        </div>
                    ))}
                    {filteredTickets.length === 0 && <div style={{ textAlign: 'center', padding: 20, background: 'var(--bg-app)', borderRadius: 12, color: 'var(--text-muted)', fontSize: 12 }}>No matching tickets</div>}
                </div>
            </section>
        </div>
    );
}
