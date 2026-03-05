// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import { useAuth } from '../context/AuthContext'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Link } from 'react-router-dom'

const COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6']
const SOURCE_COLORS = { email: '#2563eb', phone: '#16a34a', manual: '#6b7280', csv: '#9333ea' }

const ROLE_SCOPE_LABELS = {
    superadmin: 'All tickets — Super Admin view',
    gm: 'Tickets at escalation L3+ — GM view',
    manager: 'Tickets at escalation L2+ — Manager view',
    tl: 'Your team tickets — TL view',
    agent: 'Your assigned tickets — Agent view',
}

const ROLE_BADGE_COLORS = {
    superadmin: { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6' },
    gm: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' },
    manager: { bg: 'rgba(249,115,22,0.12)', color: '#f97316' },
    tl: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' },
    agent: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
}

export default function Dashboard() {
    const { user } = useAuth()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        api.get('/dashboard').then(r => setData(r.data)).finally(() => setLoading(false))
    }, [])

    if (loading) return <div className="loader-center"><div className="spinner spinner-lg" /></div>
    if (!data) return <div className="empty-state">No dashboard data available</div>

    const roleBadge = ROLE_BADGE_COLORS[user?.role] || ROLE_BADGE_COLORS.agent

    const stats = [
        {
            label: 'Total Tickets', value: data.summary.total, color: '#3b82f6',
            icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>
        },
        {
            label: 'Open', value: data.summary.open, color: '#0ea5e9',
            icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
        },
        {
            label: 'In Progress', value: data.summary.in_progress || 0, color: '#3b82f6',
            icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
        },
        {
            label: 'Closed / Resolved', value: (data.summary.resolved || 0) + (data.summary.closed || 0), color: '#10b981',
            icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
        },
        {
            label: 'Escalated', value: data.summary.escalated, color: '#f59e0b',
            icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12l-18-5Z" /><path d="M11.5 15.5 15 12l-3.5-3.5" /></svg>
        },
        {
            label: 'Overdue', value: data.summary.overdue, color: '#ef4444',
            icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        },
    ]

    // Source chart data with labels
    const sourceData = (data.charts.source || []).map(s => ({
        ...s,
        source: s.source.charAt(0).toUpperCase() + s.source.slice(1),
        fill: SOURCE_COLORS[s.source.toLowerCase()] || '#6b7280',
    }))

    return (
        <>
            <Topbar
                title="Dashboard"
                subtitle={
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ background: roleBadge.bg, color: roleBadge.color, padding: '1px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>
                            {user?.role}
                        </span>
                        <span>{ROLE_SCOPE_LABELS[user?.role] || 'Support performance overview'}</span>
                    </span>
                }
                actions={<Link to="/tickets/new" className="btn btn-primary btn-sm">+ New Ticket</Link>}
            />

            <div className="page-body">
                <div className="stats-grid">
                    {stats.map(s => (
                        <div key={s.label} className="stat-card" style={{ '--card-accent': s.color }}>
                            <div className="stat-icon" style={{ color: s.color }}>{s.icon}</div>
                            <div className="stat-label">{s.label}</div>
                            <div className="stat-value">{s.value}</div>
                        </div>
                    ))}
                </div>

                <div className="grid-3 mb-6">
                    {/* Priority Breakdown */}
                    <div className="card">
                        <div className="card-header"><div className="card-title">Priority Breakdown</div></div>
                        <div className="chart-area">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={data.charts.priority} dataKey="count" nameKey="priority" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                                        {data.charts.priority.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />)}
                                    </Pie>
                                    <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Escalation Levels */}
                    <div className="card">
                        <div className="card-header"><div className="card-title">Escalation Levels</div></div>
                        <div className="chart-area">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.charts.escalation}>
                                    <XAxis dataKey="escalation_level" stroke="var(--text-muted)" fontSize={10} />
                                    <YAxis stroke="var(--text-muted)" fontSize={10} />
                                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                                    <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} barSize={30} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Ticket Source Distribution */}
                    <div className="card">
                        <div className="card-header"><div className="card-title">Ticket Sources</div></div>
                        <div className="chart-area">
                            {sourceData.length === 0 ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>No data</div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={sourceData} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={80}>
                                            {sourceData.map((s, i) => <Cell key={i} fill={s.fill} stroke="none" />)}
                                        </Pie>
                                        <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </div>

                {/* Source summary cards */}
                {sourceData.length > 0 && (
                    <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                        {[
                            { key: 'email', label: '✉ Email', color: SOURCE_COLORS.email },
                            { key: 'phone', label: '📞 Phone', color: SOURCE_COLORS.phone },
                            { key: 'manual', label: '✍ Manual', color: SOURCE_COLORS.manual },
                            { key: 'csv', label: '📋 CSV', color: SOURCE_COLORS.csv },
                        ].map(src => {
                            const found = (data.charts.source || []).find(s => s.source === src.key)
                            return (
                                <div key={src.key} style={{ flex: 1, minWidth: 130, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: src.color, flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{src.label}</div>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{found?.count || 0}</div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                <div className="two-col">
                    {/* Customer Ticket Load */}
                    <div className="card">
                        <div className="card-header">
                            <div className="card-title">Customer Ticket Load</div>
                        </div>
                        <div className="table-wrap">
                            <table>
                                <thead><tr><th>Customer</th><th>Open</th><th>Total</th><th>Health</th></tr></thead>
                                <tbody>
                                    {data.customers.length === 0 ? (
                                        <tr><td colSpan={4} className="empty-row">No customer data</td></tr>
                                    ) : data.customers.map(c => (
                                        <tr key={c.id}>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{c.name}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.customer_code}</div>
                                            </td>
                                            <td><span className="badge badge-open">{c.open_tickets}</span></td>
                                            <td>{c.total_tickets}</td>
                                            <td>
                                                <div style={{ width: 60, height: 6, background: 'var(--bg-input)', borderRadius: 3 }}>
                                                    <div style={{ width: `${Math.min(100, (c.open_tickets / Math.max(1, c.total_tickets)) * 100)}%`, height: '100%', background: c.open_tickets > 5 ? 'var(--danger)' : 'var(--success)', borderRadius: 3 }} />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Recent Escalations */}
                    <div className="card">
                        <div className="card-header">
                            <div className="card-title">Recent Escalations</div>
                        </div>
                        <div className="timeline">
                            {data.recent_escalations.map(e => (
                                <div key={e.id} className="timeline-item">
                                    <div className="timeline-line">
                                        <div className="timeline-dot" style={{ background: 'var(--danger)' }} />
                                        <div className="timeline-connector" />
                                    </div>
                                    <div className="timeline-content">
                                        <div className="timeline-action">Ticket {e.ticket_number} → L{e.new_level}</div>
                                        <div className="timeline-meta">{e.from_name && e.to_name ? `${e.from_name} → ${e.to_name}` : e.project_name}</div>
                                        <div className="timeline-meta">{new Date(e.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                                    </div>
                                </div>
                            ))}
                            {data.recent_escalations.length === 0 && (
                                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No recent escalations</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
