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
                actions={<button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>↻ Refresh</button>} />
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
                                    <tr><td colSpan={9} className="empty-row">🎉 Queue is empty! All tickets are resolved.</td></tr>
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
                                                {overdue && '⚠ '}{t.etr ? new Date(t.etr).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
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
