// src/pages/Monitoring/CommandCenter.jsx
import { useState, useEffect } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import Topbar from '../../components/Layout/Topbar';
import DashboardStatus from '../../components/Shared/DashboardStatus';

const COLUMNS = [
    { id: 'overdue', label: 'Overdue', color: '#ef4444' },
    { id: 'due_1h', label: 'Due in 1 hour', color: '#f59e0b' },
    { id: 'due_later', label: 'No Due Date / Later', color: '#3b82f6' },
];

export default function CommandCenter() {
    const { latestSnapshot } = useSocket();
    const navigate = useNavigate();
    const [tickets, setTickets] = useState(latestSnapshot?.kanban || []);
    const [shifts, setShifts] = useState([]);
    const [priorities, setPriorities] = useState([]);
    const [filters, setFilters] = useState({
        query: '', status: '', priority: '', queueId: '',
        level: '', source: '', agentId: '', shiftId: '',
        startDate: '', endDate: ''
    });

    const filterOptions = latestSnapshot?.filterOptions || { queues: [], sources: [], categories: [], levels: [1, 2, 3] };

    useEffect(() => {
        api.get('/shifts').then(res => setShifts(res.data.shifts || [])).catch(console.error);
        api.get('/sla/priorities').then(res => setPriorities(res.data.priorities || [])).catch(console.error);
    }, []);

    useEffect(() => {
        const handleRehydrate = (e) => setTickets(e.detail.kanban || []);
        const handlePacket = (e) => {
            if (e.detail.type === 'TICKET_CREATED') {
                setTickets(prev => [e.detail.data, ...prev].slice(0, 200));
            }
        };

        window.addEventListener('dashboard_rehydrated', handleRehydrate);
        window.addEventListener('dashboard_packet', handlePacket);
        return () => {
            window.removeEventListener('dashboard_rehydrated', handleRehydrate);
            window.removeEventListener('dashboard_packet', handlePacket);
        };
    }, []);

    const uniqueAgents = Array.from(new Set(tickets.filter(t => t.assigned_to_name).map(t => JSON.stringify({ id: t.assigned_to, name: t.assigned_to_name }))))
        .map(a => JSON.parse(a));

    const getColumnTickets = (colId) => {
        const now = new Date();
        return tickets.filter(t => {
            // 1. Column Logic
            let inCol = false;
            if (!t.etr && colId === 'due_later') inCol = true;
            else if (t.etr) {
                const etr = new Date(t.etr);
                if (colId === 'overdue') inCol = etr < now;
                else if (colId === 'due_1h') inCol = etr >= now && etr < new Date(now.getTime() + 3600000);
                else if (colId === 'due_later') inCol = etr >= new Date(now.getTime() + 3600000);
            }
            if (!inCol) return false;

            // 2. Complex Filter Logic
            const q = filters.query.toLowerCase();
            if (q && !(
                t.ticket_number?.toLowerCase().includes(q) ||
                t.subject?.toLowerCase().includes(q) ||
                t.customer_name?.toLowerCase().includes(q) ||
                t.category?.toLowerCase().includes(q)
            )) return false;

            if (filters.status && t.status !== filters.status) return false;
            if (filters.priority && t.priority !== filters.priority) return false;
            if (filters.queueId && t.queue_id != filters.queueId) return false;
            if (filters.level && t.level != filters.level) return false;
            if (filters.source && t.source !== filters.source) return false;
            if (filters.agentId && t.assigned_to != filters.agentId) return false;
            if (filters.shiftId && t.assigned_to_shift_id != filters.shiftId) return false;

            if (filters.startDate) {
                const start = new Date(filters.startDate);
                if (new Date(t.created_at) < start) return false;
            }
            if (filters.endDate) {
                const end = new Date(filters.endDate);
                end.setHours(23, 59, 59, 999);
                if (new Date(t.created_at) > end) return false;
            }

            return true;
        }).slice(0, 50);
    };

    const resetFilters = () => setFilters({
        query: '', status: '', priority: '', queueId: '',
        level: '', source: '', agentId: '', shiftId: '',
        startDate: '', endDate: ''
    });

    const hasFilters = Object.values(filters).some(v => v !== '');

    return (
        <>
            <Topbar title="Command Center" subtitle={<DashboardStatus />} />

            <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* MEGA INTELLIGENCE FILTER BAR */}
                <div style={{
                    background: 'var(--bg-card)',
                    padding: '20px 24px',
                    borderRadius: 24,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    boxShadow: 'var(--shadow-md)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 2, position: 'relative' }}>
                            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }}>🔍</span>
                            <input
                                type="text"
                                placeholder="Search ticket #, category, customer..."
                                className="form-control"
                                style={{ paddingLeft: 42, background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 14, height: 48, fontSize: 13 }}
                                value={filters.query}
                                onChange={(e) => setFilters(f => ({ ...f, query: e.target.value }))}
                            />
                        </div>

                        <select className="filter-select" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
                            <option value="">All Status</option>
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="pending">Pending</option>
                        </select>

                        <select className="filter-select" value={filters.priority} onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}>
                            <option value="">All Priority</option>
                            {priorities.map(p => <option key={p.id} value={p.name}>{p.name} ({p.category_name})</option>)}
                        </select>

                        <select className="filter-select" value={filters.queueId} onChange={e => setFilters(f => ({ ...f, queueId: e.target.value }))}>
                            <option value="">All Queues</option>
                            {filterOptions.queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                        </select>

                        <select className="filter-select" value={filters.level} onChange={e => setFilters(f => ({ ...f, level: e.target.value }))}>
                            <option value="">All Levels</option>
                            {filterOptions.levels.map(l => <option key={l} value={l}>Level {l}</option>)}
                        </select>

                        <select className="filter-select" value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))}>
                            <option value="">All Sources</option>
                            {filterOptions.sources.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                        </select>

                        <select className="filter-select" value={filters.agentId} onChange={e => setFilters(f => ({ ...f, agentId: e.target.value }))}>
                            <option value="">Filter by Agent</option>
                            {uniqueAgents?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                            <span>FROM</span>
                            <input type="date" className="filter-date" value={filters.startDate} onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))} />
                            <span>TO</span>
                            <input type="date" className="filter-date" value={filters.endDate} onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))} />
                        </div>

                        <div style={{ flex: 1 }} />

                        {hasFilters && (
                            <button onClick={resetFilters} style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 16px', fontSize: 11, fontWeight: 800, color: '#ef4444', cursor: 'pointer' }}>
                                RESET FILTERS
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, height: 'calc(100vh - 360px)', minHeight: 600 }}>
                    {COLUMNS.map(col => {
                        const colTickets = getColumnTickets(col.id);
                        return (
                            <div key={col.id} style={{
                                background: 'var(--bg-card)', borderRadius: 24, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--shadow-md)'
                            }}>
                                <div style={{ padding: '16px 20px', borderBottom: `4px solid ${col.color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `${col.color}05` }}>
                                    <span style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>{col.label}</span>
                                    <span style={{ background: 'var(--bg-app)', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 800, border: '1px solid var(--border)' }}>{colTickets.length}</span>
                                </div>

                                <div className="kanban-col" style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {colTickets.map(t => (
                                        <div key={t.id} onClick={() => navigate(`/tickets/${t.id}`)} className="card monitoring-card" style={{ padding: 16, border: '1px solid var(--border-subtle)', transition: 'all 0.2s ease', cursor: 'pointer' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)' }}>#{t.ticket_number}</span>
                                                    <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', background: 'var(--bg-app)', borderRadius: 6, border: '1px solid var(--border)' }}>{t.source?.toUpperCase()}</span>
                                                </div>
                                                <span className={`badge badge-${t.priority.toLowerCase()}`} style={{ scale: 0.8 }}>{t.priority}</span>
                                            </div>
                                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>{t.subject || 'No Subject'}</div>
                                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 16, display: 'flex', gap: 12 }}>
                                                <span>🏢 {t.customer_name || 'Individual'}</span>
                                                <span>📁 {t.queue_name || 'General'}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>📅 {t.etr ? new Date(t.etr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---'}</div>
                                                <div style={{ background: 'var(--bg-app)', padding: '2px 8px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 9, fontWeight: 800, color: t.assigned_to_name ? 'var(--text-primary)' : '#ef4444' }}>
                                                    {t.assigned_to_name ? t.assigned_to_name.substring(0, 15) : 'UNASSIGNED'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {colTickets.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>No matching items</div>}
                                </div>
                            </div>
                        )
                    })}
                </div>

                <style>{`
                    .filter-select { 
                        height: 48px; border-radius: 14px; background: var(--bg-app); border: 1px solid var(--border);
                        padding: 0 16px; font-size: 12px; font-weight: 700; color: var(--text-primary); cursor: pointer;
                        min-width: 130px;
                    }
                    .filter-date {
                        background: var(--bg-app); border: 1px solid var(--border); border-radius: 10px;
                        padding: 6px 12px; font-size: 11px; font-weight: 700; color: var(--text-primary);
                    }
                `}</style>
            </div>
        </>
    );
}
