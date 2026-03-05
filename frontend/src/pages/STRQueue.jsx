// src/pages/STRQueue.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'

function PriorityBadge({ p }) { return <span className={`priority-badge p${p?.[1]}-badge`}>{p}</span> }
function LevelBadge({ l }) { return <span className={`level-badge level-${l}`}>L{l}</span> }

export default function STRQueue() {
    const [queue, setQueue] = useState([])
    const [loading, setLoading] = useState(true)
    const navigate = useNavigate()

    useEffect(() => {
        api.get('/tickets/queue/str').then(r => setQueue(r.data.queue)).finally(() => setLoading(false))
    }, [])

    // Group by assigned user
    const grouped = queue.reduce((acc, t) => {
        const key = t.assigned_to_name || 'Unassigned'
        if (!acc[key]) acc[key] = []
        acc[key].push(t)
        return acc
    }, {})

    const now = new Date()

    return (
        <>
            <Topbar title="STR Queue" subtitle={`${queue.length} active tickets in queue`}
                actions={
                    <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg> Refresh
                    </button>
                } />
            <div className="page-body">
                {/* Summary cards */}
                <div className="stats-grid mb-4">
                    {Object.entries(grouped).slice(0, 6).map(([name, tix]) => (
                        <div key={name} className="stat-card">
                            <div className="stat-label">{name}</div>
                            <div className="stat-value">{tix.length}</div>
                            <div className="stat-change">{tix.filter(t => new Date(t.etr) < now).length} overdue</div>
                        </div>
                    ))}
                </div>

                <div className="card">
                    <div className="card-header">
                        <div className="card-title">Active Ticket Queue (sorted by Priority + STR)</div>
                    </div>
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Ticket #</th><th>Priority</th><th>Level</th><th>Customer</th>
                                    <th>Assigned To</th><th>Role</th><th>STR</th><th>ETR</th><th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: 'auto' }} /></td></tr>
                                ) : queue.length === 0 ? (
                                    <tr><td colSpan={9} className="empty-row">
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px 0' }}>
                                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--success)' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                                            Queue is empty! All tickets are resolved.
                                        </div>
                                    </td></tr>
                                ) : queue.map(t => {
                                    const overdue = t.etr && new Date(t.etr) < now
                                    return (
                                        <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/tickets/${t.id}`)}>
                                            <td><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>{t.ticket_number}</span></td>
                                            <td><PriorityBadge p={t.priority} /></td>
                                            <td><LevelBadge l={t.escalation_level} /></td>
                                            <td>
                                                <div style={{ fontWeight: 600, fontSize: 13 }}>{t.customer_name}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.project_name}</div>
                                            </td>
                                            <td>{t.assigned_to_name || '—'}</td>
                                            <td><span className={`role-badge role-${t.assigned_role}`}>{t.assigned_role}</span></td>
                                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.str ? new Date(t.str).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                            <td style={{ fontSize: 12, color: overdue ? 'var(--danger)' : 'var(--text-secondary)' }}>
                                                {overdue && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
                                                {t.etr ? new Date(t.etr).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                            </td>
                                            <td><span className={`badge badge-${t.status}`}>{t.status?.replace('_', ' ')}</span></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </>
    )
}
