// src/components/Dashboard/DashboardView.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line, CartesianGrid } from 'recharts';

const COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'];
const SOURCE_COLORS = { email: '#2563eb', phone: '#16a34a', manual: '#6b7280', csv: '#9333ea' };

export default function DashboardView({ targetUserId, targetShiftId, isPortal = false }) {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ search: '', status: '', priority: '', level: '', source: '', category: '' });

    useEffect(() => {
        let url = '/dashboard';
        const params = new URLSearchParams();
        if (targetUserId) params.append('targetUserId', targetUserId);
        if (targetShiftId) params.append('shiftId', targetShiftId);
        
        const queryString = params.toString();
        if (queryString) url += `?${queryString}`;

        setLoading(true);
        api.get(url)
            .then(r => setData(r.data))
            .catch(err => {
                console.error("Dashboard Fetch Error:", err);
                setData({ summary: { total: 0, open: 0, overdue: 0 }, recent_tickets: [], charts: { priority: [], status: [] } });
            })
            .finally(() => setLoading(false));
    }, [targetUserId, targetShiftId]);

    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>;
    if (!data || !data.summary) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No data available for this scope</div>;

    const stats = [
        { 
            label: 'Total Tickets', value: data.summary.total || 0, color: '#3b82f6',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>
        },
        { 
            label: 'Open', value: data.summary.open || 0, color: '#0ea5e9',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
        },
        { 
            label: 'In Progress', value: data.summary.in_progress || 0, color: '#3b82f6',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
        },
        { 
            label: 'Resolved', value: (data.summary.resolved || 0) + (data.summary.closed || 0), color: '#10b981',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
        },
        { 
            label: 'Overdue', value: data.summary.overdue || 0, color: '#ef4444',
            icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>,
            isRisk: (data.summary.overdue || 0) > 0
        },
    ];

    const filterOptions = {
        sources: [...new Set((data.recent_tickets || []).map(t => t.source).filter(Boolean))],
        categories: [...new Set((data.recent_tickets || []).map(t => t.category).filter(Boolean))],
        levels: [...new Set((data.recent_tickets || []).map(t => t.level).filter(Boolean))].sort(),
        statuses: [...new Set((data.recent_tickets || []).map(t => t.status).filter(Boolean))],
        priorities: [...new Set((data.recent_tickets || []).map(t => t.priority).filter(Boolean))].sort()
    };

    const filteredTickets = (data.recent_tickets || []).filter(t => {
        if (filters.search && !t.ticket_number?.toLowerCase().includes(filters.search.toLowerCase()) && !t.subject?.toLowerCase().includes(filters.search.toLowerCase()) && !t.customer_name?.toLowerCase().includes(filters.search.toLowerCase())) return false;
        if (filters.status && t.status !== filters.status) return false;
        if (filters.priority && t.priority !== filters.priority) return false;
        if (filters.level && String(t.level) !== String(filters.level)) return false;
        if (filters.source && t.source !== filters.source) return false;
        if (filters.category && t.category !== filters.category) return false;
        return true;
    });

    const hasFilters = Object.values(filters).some(v => v !== '');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: isPortal ? 20 : 32 }}>
            {/* Real Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${isPortal ? '140px' : '180px'}, 1fr))`, gap: 20 }}>
                {stats.map(s => (
                    <div key={s.label} className={`stat-card ${s.isRisk ? 'risk-pulse' : ''}`} style={{ borderLeft: `4px solid ${s.color}`, padding: isPortal ? '16px' : '20px' }}>
                        <div className="stat-icon" style={{ color: s.color, marginBottom: 12 }}>{s.icon}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div className="stat-label" style={{ fontSize: isPortal ? 10 : 12 }}>{s.label}</div>
                                <div className="stat-value" style={{ fontSize: isPortal ? 20 : 24 }}>{s.value}</div>
                            </div>
                            {s.isRisk && <span style={{ background: '#ef4444', color: 'white', fontSize: 8, padding: '2px 6px', borderRadius: 10, fontWeight: 900 }}>CRITICAL</span>}
                        </div>
                    </div>
                ))}
            </div>

            {/* UNIFIED OPERATIONAL HUD (Management Only) */}
            {!isPortal && data.monitoring && (
                <div className="grid-2" style={{ gap: 24 }}>
                    {/* Response Trends Chart */}
                    <div className="card" style={{ padding: 24 }}>
                        <div className="card-header" style={{ marginBottom: 20 }}>
                            <div className="card-title" style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Response Trends (Last 24h)</div>
                        </div>
                        <div style={{ height: 260 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={data.monitoring.trends || []}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                                    <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                                    <Tooltip 
                                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}
                                        itemStyle={{ fontSize: 12, fontWeight: 700 }}
                                    />
                                    <Line type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={4} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Live Traffic Capacity */}
                    <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div className="card-header"><div className="card-title" style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Live Traffic Capacity</div></div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
                            <Gauge value={Math.min(100, Math.round(((data.summary.resolved || 0) / Math.max(1, data.summary.total || 0)) * 100))} label="THROUGHPUT" color="#10b981" />
                            <Gauge value={Math.min(100, Math.round(((data.summary.overdue || 0) / Math.max(1, data.summary.open || 0)) * 100))} label="SLA RISK" color="#ef4444" />
                        </div>
                    </div>

                    {/* Operational Shift Health Section */}
                    <div className="card" style={{ padding: 24, gridColumn: 'span 2' }}>
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                            <div className="card-title" style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Shift Performance HUD</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Algorithm: Capacity vs Load Scoring</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                            {(data.monitoring.shiftMetrics || []).map(sm => {
                                const healthColor = sm.health === 'critical' ? '#ef4444' : (sm.health === 'warning' ? '#f59e0b' : '#10b981');
                                return (
                                    <div 
                                        key={sm.id} 
                                        className={`shift-card monitoring-card ${sm.health === 'critical' ? 'risk-pulse' : ''}`} 
                                        onClick={() => navigate(`/monitoring/shift/${sm.id}`)}
                                        style={{ 
                                            background: 'var(--bg-app)', 
                                            padding: 20, 
                                            borderRadius: 20, 
                                            border: `1px solid ${healthColor}40`,
                                            borderTop: `4px solid ${healthColor}`,
                                            cursor: 'pointer',
                                            position: 'relative'
                                        }}
                                    >
                                        <div style={{ position: 'absolute', top: 10, right: 15, fontSize: 16 }}>
                                            {sm.health === 'critical' ? '🔴' : (sm.health === 'warning' ? '🟡' : '🟢')}
                                        </div>
                                        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{sm.name}</div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: healthColor, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                                            {sm.health_reason}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Staffing Ratio</span>
                                            <span style={{ fontWeight: 800 }}>{sm.manpower_available} / {sm.manpower_needed}</span>
                                        </div>
                                        <div style={{ marginTop: 15, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                            <div style={{ 
                                                width: `${Math.min(100, (sm.manpower_available / Math.max(1, sm.manpower_needed)) * 100)}%`, 
                                                height: '100%', 
                                                background: healthColor,
                                                transition: 'width 1s ease'
                                            }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Active Work Items Section (Portal Only Upgrade) */}
            {isPortal && (
                <div className="card">
                    <div className="card-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: hasFilters ? 16 : 0 }}>
                            <div className="card-title" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: 'var(--accent)' }}>📋</span> 
                                Active Work Items ({filteredTickets.length})
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Real-time sync</span>
                        </div>

                        {/* MEGA-FILTER MINI (Portal Edition) */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
                            <input 
                                type="text" 
                                placeholder="Search items..." 
                                className="form-control"
                                style={{ flex: 2, height: 32, fontSize: 11, background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 8, minWidth: 150 }}
                                value={filters.search}
                                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                            />
                            <select className="portal-filter" value={filters.priority} onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}>
                                <option value="">Priority</option>
                                {filterOptions.priorities.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <select className="portal-filter" value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))}>
                                <option value="">Source</option>
                                {filterOptions.sources.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                            </select>
                            <select className="portal-filter" value={filters.level} onChange={e => setFilters(f => ({ ...f, level: e.target.value }))}>
                                <option value="">Level</option>
                                {filterOptions.levels.map(l => <option key={l} value={l}>L{l}</option>)}
                            </select>
                            {hasFilters && (
                                <button onClick={() => setFilters({ search: '', status: '', priority: '', level: '', source: '', category: '' })} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>RESET</button>
                            )}
                        </div>
                    </div>

                    <div className="table-wrap" style={{ maxHeight: isPortal ? '500px' : 'none', overflowY: isPortal ? 'auto' : 'visible' }}>
                        <table style={{ fontSize: 13, tableLayout: 'fixed', width: '100%' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '140px' }}>Ticket</th>
                                    <th>Subject</th>
                                    <th style={{ width: '80px' }}>Priority</th>
                                    <th style={{ width: '120px' }}>Customer</th>
                                    <th style={{ width: '100px' }}>Due</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTickets.map(t => (
                                    <tr key={t.id} onClick={() => navigate(`/tickets/${t.id}`)} style={{ cursor: 'pointer' }}>
                                        <td style={{ fontWeight: 800, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.ticket_number}>
                                            #{t.ticket_number}
                                        </td>
                                        <td style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.subject}>
                                            {t.subject || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No subject</span>}
                                        </td>
                                        <td><span className={`badge badge-${(t.priority || 'p3').toLowerCase()}`} style={{ scale: 0.8 }}>{t.priority || 'P3'}</span></td>
                                        <td style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {t.customer_name || 'Individual'}
                                        </td>
                                        <td style={{ fontSize: 11, fontWeight: 700, color: new Date(t.etr) < new Date() ? '#ef4444' : 'inherit' }}>
                                            {t.etr ? new Date(t.etr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---'}
                                        </td>
                                    </tr>
                                ))}
                                {filteredTickets.length === 0 && (
                                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No active items matching filters</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <style>{`
                .portal-filter {
                    height: 32px; font-size: 11px; background: var(--bg-app); border: 1px solid var(--border);
                    border-radius: 8px; color: var(--text-primary); font-weight: 700; padding: 0 8px; cursor: pointer;
                    min-width: 80px;
                }
            `}</style>

            {/* Legacy Charts Section (Only shown if monitoring HUD isn't taking up space) */}
            {(!data.monitoring || isPortal) && (
                <div style={{ display: 'grid', gridTemplateColumns: isPortal ? '1fr' : 'repeat(auto-fit, minmax(350px, 1fr))', gap: 24 }}>
                    <div className="card" style={{ padding: 24 }}>
                        <div className="card-header" style={{ marginBottom: 20 }}><div className="card-title" style={{ fontSize: 14 }}>Priority Breakdown</div></div>
                        <div style={{ height: 220 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={data.charts.priority || []} dataKey="count" nameKey="priority" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                                        {(data.charts.priority || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12 }} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="card" style={{ padding: 24 }}>
                        <div className="card-header" style={{ marginBottom: 20 }}><div className="card-title" style={{ fontSize: 14 }}>Status Distribution</div></div>
                        <div style={{ height: 220 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.charts.status || []}>
                                    <XAxis dataKey="status" stroke="var(--text-muted)" fontSize={10} axisLine={false} tickLine={false} />
                                    <YAxis stroke="var(--text-muted)" fontSize={10} axisLine={false} tickLine={false} />
                                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12 }} />
                                    <Bar dataKey="count" fill="var(--accent)" radius={[6, 6, 0, 0]} barSize={24} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {/* Customer Load Table */}
            {!isPortal && (
                <div className="card">
                    <div className="card-header" style={{ padding: 24 }}><div className="card-title" style={{ fontSize: 14 }}>Customer Load</div></div>
                    <div className="table-wrap">
                        <table>
                            <thead><tr><th>Customer</th><th>Open</th><th>Total</th><th>Health</th></tr></thead>
                            <tbody>
                                {(data.customers || []).map(c => (
                                    <tr key={c.id}>
                                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                                        <td><span className="badge badge-open">{c.open_tickets}</span></td>
                                        <td>{c.total_tickets}</td>
                                        <td>
                                            <div style={{ width: 60, height: 4, background: 'var(--border)', borderRadius: 2 }}>
                                                <div style={{ width: `${Math.min(100, (c.open_tickets / Math.max(1, c.total_tickets)) * 100)}%`, height: '100%', background: c.open_tickets > 5 ? '#ef4444' : '#10b981', borderRadius: 2 }} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function Gauge({ value, label, color }) {
    const size = 110;
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;

    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{ position: 'relative', width: size, height: size }}>
                <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx={size / 2} cy={size / 2} r={radius} fill="transparent" stroke="var(--bg-app)" strokeWidth="8" />
                    <circle cx={size / 2} cy={size / 2} r={radius} fill="transparent" stroke={color} strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
                </svg>
                <div style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 20, fontWeight: 800 }}>{value}%</span>
                    <span style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 800 }}>{label}</span>
                </div>
            </div>
        </div>
    );
}
