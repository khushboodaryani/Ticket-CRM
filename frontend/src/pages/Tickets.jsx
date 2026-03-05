// src/pages/Tickets.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const PRIORITY_DOT = { P1: '#ef4444', P2: '#f97316', P3: '#eab308', P4: '#22c55e', P5: '#6b7280' }

// SVG Icons for professional look
const ICON_MAIL = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
const ICON_PHONE = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
const ICON_USER = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
const ICON_CSV = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>

const SOURCE_STYLES = {
    email: { bg: 'rgba(37,99,235,0.08)', color: '#2563eb', label: 'Email Channel', icon: ICON_MAIL },
    call: { bg: 'rgba(22,163,74,0.08)', color: '#16a34a', label: 'Phone Call', icon: ICON_PHONE },
    manual: { bg: 'rgba(107,114,128,0.08)', color: '#6b7280', label: 'System Manual', icon: ICON_USER },
    csv: { bg: 'rgba(147,51,234,0.08)', color: '#9333ea', label: 'CSV Upload', icon: ICON_CSV },
}

function SourceBadge({ s }) {
    const style = SOURCE_STYLES[s?.toLowerCase()] || SOURCE_STYLES.manual
    return (
        <span style={{
            background: style.bg,
            color: style.color,
            padding: '3px 9px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
        }}>
            {style.icon}
            {style.label}
        </span>
    )
}
function PriorityBadge({ p }) { return <span className={`priority-badge p${p[1]}-badge`}>{p}</span> }
function StatusBadge({ s }) { return <span className={`badge badge-${s}`}>{s.replace('_', ' ')}</span> }
function LevelBadge({ l }) { return <span className={`level-badge level-${l}`}>L{l}</span> }

export default function Tickets() {
    const { user } = useAuth()
    const [tickets, setTickets] = useState([])
    const [loading, setLoading] = useState(true)
    const [filters, setFilters] = useState({ status: '', priority: '', escalation_level: '', source: '', search: '' })
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const navigate = useNavigate()
    const limit = 15

    // Bulk selection state
    const [selected, setSelected] = useState(new Set())
    const [bulkStatus, setBulkStatus] = useState('')
    const [bulkLoading, setBulkLoading] = useState(false)
    const [exportLoading, setExportLoading] = useState(false)

    const canImport = ['superadmin', 'gm', 'manager'].includes(user?.role)

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

    // Client-side filter for search + source
    const filtered = tickets.filter(t => {
        const matchSearch = !filters.search ||
            t.ticket_number?.toLowerCase().includes(filters.search.toLowerCase()) ||
            t.category?.toLowerCase().includes(filters.search.toLowerCase()) ||
            t.customer_name?.toLowerCase().includes(filters.search.toLowerCase())
        const matchSource = !filters.source || (t.source || 'manual').toLowerCase() === filters.source.toLowerCase()
        return matchSearch && matchSource
    })

    const pages = Math.ceil(total / limit)

    // ── Selection helpers ──────────────────────────────────────────────
    const allSelected = filtered.length > 0 && filtered.every(t => selected.has(t.id))
    const toggleAll = () => {
        if (allSelected) setSelected(new Set())
        else setSelected(new Set(filtered.map(t => t.id)))
    }
    const toggleOne = (id, e) => {
        e.stopPropagation()
        setSelected(prev => {
            const n = new Set(prev)
            n.has(id) ? n.delete(id) : n.add(id)
            return n
        })
    }

    // ── Bulk Update ───────────────────────────────────────────────────
    const handleBulkUpdate = async () => {
        if (!bulkStatus || selected.size === 0) return toast.error('Select tickets and a status')
        setBulkLoading(true)
        try {
            const { data } = await api.put('/tickets/bulk', { ids: [...selected], status: bulkStatus })
            toast.success(data.message)
            setSelected(new Set()); setBulkStatus(''); fetchTickets()
        } catch (err) { toast.error(err.response?.data?.message || 'Bulk update failed') }
        setBulkLoading(false)
    }

    // ── CSV Export ─────────────────────────────────────────────────────
    const handleExport = async () => {
        setExportLoading(true)
        try {
            const params = new URLSearchParams()
            if (filters.status) params.set('status', filters.status)
            if (filters.priority) params.set('priority', filters.priority)
            const res = await api.get(`/tickets/export?${params}`, { responseType: 'blob' })
            const url = URL.createObjectURL(res.data)
            const a = document.createElement('a')
            a.href = url
            a.download = `tickets_${new Date().toISOString().slice(0, 10)}.csv`
            a.click(); URL.revokeObjectURL(url)
            toast.success('Export downloaded!')
        } catch { toast.error('Export failed') }
        setExportLoading(false)
    }

    return (
        <>
            <Topbar
                title="Tickets"
                subtitle={`${total} total tickets`}
                actions={
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={handleExport}
                            disabled={exportLoading}
                        >
                            {exportLoading ? '…' : '⬇ Export CSV'}
                        </button>
                        {canImport && (
                            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/tickets/import')}>
                                ⬆ Import CSV
                            </button>
                        )}
                        <button className="btn btn-primary btn-sm" onClick={() => navigate('/tickets/new')}>
                            + New Ticket
                        </button>
                    </div>
                }
            />

            <div className="page-body">
                {/* ── Bulk Action Bar (appears when rows selected) ── */}
                {selected.size > 0 && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        background: 'var(--accent-light)', border: '1px solid var(--accent)',
                        borderRadius: 10, padding: '10px 16px', marginBottom: 16,
                        flexWrap: 'wrap'
                    }}>
                        <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 13 }}>
                            {selected.size} ticket{selected.size !== 1 ? 's' : ''} selected
                        </span>
                        <select
                            className="input"
                            value={bulkStatus}
                            onChange={e => setBulkStatus(e.target.value)}
                            style={{ width: 'auto', fontSize: 13, padding: '6px 10px' }}
                        >
                            <option value="">Change status to…</option>
                            {['open', 'in_progress', 'pending', 'resolved', 'closed'].map(s => (
                                <option key={s} value={s}>{s.replace('_', ' ')}</option>
                            ))}
                        </select>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={handleBulkUpdate}
                            disabled={bulkLoading || !bulkStatus}
                        >
                            {bulkLoading ? 'Updating…' : 'Apply'}
                        </button>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setSelected(new Set())}
                        >
                            Clear selection
                        </button>
                    </div>
                )}

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
                            {Object.entries(SOURCE_STYLES).map(([k, s]) => (
                                <option key={k} value={k}>{s.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: 36 }}>
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={toggleAll}
                                            style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                                        />
                                    </th>
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
                                    <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: 'auto' }} /></td></tr>
                                ) : filtered.length === 0 ? (
                                    <tr><td colSpan={11} className="empty-row">No tickets found</td></tr>
                                ) : filtered.map(t => (
                                    <tr
                                        key={t.id}
                                        style={{ cursor: 'pointer', background: selected.has(t.id) ? 'var(--accent-light)' : undefined }}
                                        onClick={() => navigate(`/tickets/${t.id}`)}
                                    >
                                        <td onClick={e => toggleOne(t.id, e)}>
                                            <input
                                                type="checkbox"
                                                checked={selected.has(t.id)}
                                                onChange={() => { }}
                                                style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                                            />
                                        </td>
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
