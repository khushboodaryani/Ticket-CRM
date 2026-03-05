// src/pages/Tickets.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import { useAuth } from '../context/AuthContext'

const PRIORITY_DOT = { P1: '#ef4444', P2: '#f97316', P3: '#eab308', P4: '#22c55e', P5: '#6b7280' }

const SOURCE_STYLES = {
    email: { bg: '#eff6ff', color: '#2563eb', label: '✉ Email' },
    phone: { bg: '#f0fdf4', color: '#16a34a', label: '📞 Phone' },
    manual: { bg: '#fafafa', color: '#6b7280', label: '✍ Manual' },
    csv: { bg: '#fdf4ff', color: '#9333ea', label: '📋 CSV' },
}

function SourceBadge({ s }) {
    const style = SOURCE_STYLES[s?.toLowerCase()] || SOURCE_STYLES.manual
    return (
        <span style={{
            background: style.bg,
            color: style.color,
            padding: '2px 8px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
        }}>
            {style.label}
        </span>
    )
}

function PriorityBadge({ p }) {
    return <span className={`priority-badge p${p[1]}-badge`}>{p}</span>
}
function StatusBadge({ s }) {
    return <span className={`badge badge-${s}`}>{s.replace('_', ' ')}</span>
}
function LevelBadge({ l }) {
    return <span className={`level-badge level-${l}`}>L{l}</span>
}

export default function Tickets() {
    const [tickets, setTickets] = useState([])
    const [loading, setLoading] = useState(true)
    const [filters, setFilters] = useState({ status: '', priority: '', escalation_level: '', source: '', search: '' })
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const navigate = useNavigate()
    const limit = 15

    const fetchTickets = async () => {
        setLoading(true)
        try {
            const params = { page, limit }
            if (filters.status) params.status = filters.status
            if (filters.priority) params.priority = filters.priority
            if (filters.escalation_level) params.escalation_level = filters.escalation_level
            const { data } = await api.get('/tickets', { params })
            setTickets(data.tickets)
            setTotal(data.pagination.total)
        } catch { }
        setLoading(false)
    }

    useEffect(() => { fetchTickets() }, [page, filters])

    // Client-side filter for search + source (since backend search is basic)
    const filtered = tickets.filter(t => {
        const matchSearch = !filters.search ||
            t.ticket_number?.toLowerCase().includes(filters.search.toLowerCase()) ||
            t.category?.toLowerCase().includes(filters.search.toLowerCase()) ||
            t.customer_name?.toLowerCase().includes(filters.search.toLowerCase())
        const matchSource = !filters.source ||
            (t.source || 'manual').toLowerCase() === filters.source.toLowerCase()
        return matchSearch && matchSource
    })

    const pages = Math.ceil(total / limit)

    return (
        <>
            <Topbar
                title="Tickets"
                subtitle={`${total} total tickets`}
                actions={<button className="btn btn-primary btn-sm" onClick={() => navigate('/tickets/new')}>+ New Ticket</button>}
            />
            <div className="page-body">
                <div className="card">
                    <div className="filters-bar">
                        <div className="search-box">
                            <span className="search-icon">🔍</span>
                            <input
                                className="search-input"
                                placeholder="Search ticket #, category, customer…"
                                value={filters.search}
                                onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
                            />
                        </div>
                        <select className="filter-select" value={filters.status} onChange={e => { setFilters(p => ({ ...p, status: e.target.value })); setPage(1) }}>
                            <option value="">All Status</option>
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="pending">Pending</option>
                            <option value="resolved">Resolved</option>
                            <option value="closed">Closed</option>
                        </select>
                        <select className="filter-select" value={filters.priority} onChange={e => { setFilters(p => ({ ...p, priority: e.target.value })); setPage(1) }}>
                            <option value="">All Priority</option>
                            {['P1', 'P2', 'P3', 'P4', 'P5'].map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <select className="filter-select" value={filters.escalation_level} onChange={e => { setFilters(p => ({ ...p, escalation_level: e.target.value })); setPage(1) }}>
                            <option value="">All Levels</option>
                            <option value="1">Level 1 (Agent)</option>
                            <option value="2">Level 2 (TL)</option>
                            <option value="3">Level 3 (Manager)</option>
                            <option value="4">Level 4 (GM)</option>
                        </select>
                        <select className="filter-select" value={filters.source} onChange={e => setFilters(p => ({ ...p, source: e.target.value }))}>
                            <option value="">All Sources</option>
                            <option value="email">✉ Email</option>
                            <option value="phone">📞 Phone</option>
                            <option value="manual">✍ Manual</option>
                            <option value="csv">📋 CSV</option>
                        </select>
                    </div>

                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Ticket #</th>
                                    <th>Customer / Project</th>
                                    <th>Category</th>
                                    <th>Source</th>
                                    <th>Priority</th>
                                    <th>Status</th>
                                    <th>Level</th>
                                    <th>Assigned To</th>
                                    <th>ETR</th>
                                    <th>Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: 'auto' }} /></td></tr>
                                ) : filtered.length === 0 ? (
                                    <tr><td colSpan={10} className="empty-row">No tickets found</td></tr>
                                ) : filtered.map(t => (
                                    <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/tickets/${t.id}`)}>
                                        <td>
                                            <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>{t.ticket_number}</span>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600, fontSize: 13 }}>{t.customer_name}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.project_name}</div>
                                        </td>
                                        <td>{t.category}</td>
                                        <td><SourceBadge s={t.source || 'manual'} /></td>
                                        <td><PriorityBadge p={t.priority} /></td>
                                        <td><StatusBadge s={t.status} /></td>
                                        <td><LevelBadge l={t.escalation_level} /></td>
                                        <td>{t.assigned_to_name || <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>}</td>
                                        <td>
                                            {t.etr ? (
                                                <span style={{ color: new Date(t.etr) < new Date() && t.status !== 'resolved' && t.status !== 'closed' ? 'var(--danger)' : 'var(--text-secondary)', fontSize: 12 }}>
                                                    {new Date(t.etr).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                            {new Date(t.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {pages > 1 && (
                        <div className="pagination">
                            <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                            {Array.from({ length: Math.min(pages, 7) }, (_, i) => i + 1).map(p => (
                                <button key={p} className={`page-btn${page === p ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                            ))}
                            <button className="page-btn" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next →</button>
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}
