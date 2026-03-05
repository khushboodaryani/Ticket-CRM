// src/pages/TicketDetail.jsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

function StatusBadge({ s }) { return <span className={`badge badge-${s}`}>{s?.replace('_', ' ')}</span> }
function PriorityBadge({ p }) { return <span className={`priority-badge p${p?.[1]}-badge`}>{p}</span> }
function LevelBadge({ l }) { return <span className={`level-badge level-${l}`}>Level {l}</span> }

const STATUS_OPTIONS = ['open', 'in_progress', 'pending', 'resolved', 'closed']
const ESC_COLORS = { 1: 'var(--info)', 2: 'var(--warning)', 3: '#f97316', 4: 'var(--danger)' }

export default function TicketDetail() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()
    const [ticket, setTicket] = useState(null)
    const [logs, setLogs] = useState([])
    const [activity, setActivity] = useState([])
    const [loading, setLoading] = useState(true)
    const [updating, setUpdating] = useState(false)
    const [status, setStatus] = useState('')
    const [assignUsers, setAssignUsers] = useState([])
    const [assignedTo, setAssignedTo] = useState('')
    const [escalateReason, setEscalateReason] = useState('')
    const [showEscModal, setShowEscModal] = useState(false)

    const load = async () => {
        const { data } = await api.get(`/tickets/${id}`)
        setTicket(data.ticket)
        setLogs(data.escalation_logs)
        setActivity(data.activity)
        setStatus(data.ticket.status)
        setAssignedTo(data.ticket.assigned_to || '')
        setLoading(false)
    }

    const loadUsers = async () => {
        const { data } = await api.get('/users')
        setAssignUsers(data.users)
    }

    useEffect(() => { load(); loadUsers() }, [id])

    const handleUpdate = async () => {
        setUpdating(true)
        try {
            await api.put(`/tickets/${id}`, { status, assigned_to: assignedTo || undefined })
            toast.success('Ticket updated!')
            load()
        } catch (err) { toast.error(err.response?.data?.message || 'Update failed') }
        setUpdating(false)
    }

    const handleEscalate = async () => {
        try {
            await api.post(`/tickets/${id}/escalate`, { reason: escalateReason })
            toast.success('Ticket escalated!')
            setShowEscModal(false)
            load()
        } catch (err) { toast.error(err.response?.data?.message || 'Escalation failed') }
    }

    if (loading) return <><Topbar title="Ticket Detail" /><div className="loader-center"><div className="spinner spinner-lg" /></div></>
    if (!ticket) return <><Topbar title="Ticket Detail" /><div className="page-body"><div className="empty-state">Ticket not found</div></div></>

    const isOverdue = ticket.etr && new Date(ticket.etr) < new Date() && !['resolved', 'closed'].includes(ticket.status)
    const canEscalate = ['superadmin', 'gm', 'manager', 'tl'].includes(user?.role)

    return (
        <>
            <Topbar
                title={ticket.ticket_number}
                subtitle={`${ticket.customer_name} › ${ticket.project_name}`}
                actions={
                    <div className="btn-row">
                        {isOverdue && <span className="badge" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg> Overdue
                        </span>}
                        {canEscalate && ticket.escalation_level < 4 && (
                            <button className="btn btn-danger btn-sm" onClick={() => setShowEscModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg> Escalate
                            </button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/tickets')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg> Back
                        </button>
                    </div>
                }
            />
            <div className="page-body">
                <div className="two-col">
                    {/* Left: ticket info */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Meta */}
                        <div className="card">
                            <div className="detail-header">
                                <div className="detail-title">{ticket.category}</div>
                                <div className="detail-meta">
                                    <PriorityBadge p={ticket.priority} />
                                    <StatusBadge s={ticket.status} />
                                    <LevelBadge l={ticket.escalation_level} />
                                </div>
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
                                {ticket.description}
                            </div>
                            {ticket.attachment_url && (
                                <a href={ticket.attachment_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg> View Attachment
                                </a>
                            )}
                        </div>

                        {/* Info grid */}
                        <div className="card">
                            <div className="card-title" style={{ marginBottom: 16 }}>Ticket Details</div>
                            <div className="info-grid">
                                <div><div className="info-key">Customer</div><div className="info-val">{ticket.customer_name}</div></div>
                                <div><div className="info-key">Project</div><div className="info-val">{ticket.project_name}</div></div>
                                <div><div className="info-key">Source</div><div className="info-val" style={{ textTransform: 'capitalize' }}>{ticket.source}</div></div>
                                <div><div className="info-key">Created By</div><div className="info-val">{ticket.created_by_name}</div></div>
                                <div><div className="info-key">Assigned To</div><div className="info-val">{ticket.assigned_to_name || '—'}</div></div>
                                <div><div className="info-key">STR</div><div className="info-val">{ticket.str ? new Date(ticket.str).toLocaleString('en-IN') : '—'}</div></div>
                                <div><div className="info-key">ETR</div><div className="info-val" style={{ color: isOverdue ? 'var(--danger)' : undefined }}>{ticket.etr ? new Date(ticket.etr).toLocaleString('en-IN') : '—'}</div></div>
                                <div><div className="info-key">SLA Paused</div><div className="info-val" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {ticket.sla_paused
                                        ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg> Paused</>
                                        : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg> Running</>
                                    }
                                </div></div>
                                <div><div className="info-key">Created At</div><div className="info-val">{new Date(ticket.created_at).toLocaleString('en-IN')}</div></div>
                                <div><div className="info-key">Last Updated</div><div className="info-val">{new Date(ticket.updated_at).toLocaleString('en-IN')}</div></div>
                            </div>
                        </div>

                        {/* Update controls */}
                        <div className="card">
                            <div className="card-title" style={{ marginBottom: 16 }}>Update Ticket</div>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label className="form-label">Status</label>
                                    <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
                                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Assign To</label>
                                    <select className="input" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                                        <option value="">— Unassigned —</option>
                                        {assignUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="btn-row" style={{ marginTop: 16 }}>
                                <button className="btn btn-primary" onClick={handleUpdate} disabled={updating} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {updating
                                        ? <><span className="spinner" style={{ width: 14, height: 14 }} />Saving…</>
                                        : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg> Save Changes</>
                                    }
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right: escalation + activity */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Escalation progress */}
                        <div className="card">
                            <div className="card-title" style={{ marginBottom: 16 }}>Escalation Progress</div>
                            {[1, 2, 3, 4].map(lvl => (
                                <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, opacity: ticket.escalation_level >= lvl ? 1 : 0.35 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: ticket.escalation_level >= lvl ? ESC_COLORS[lvl] : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{lvl}</div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600 }}>Level {lvl}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{{ 1: 'Agent', 2: 'Team Lead', 3: 'Manager', 4: 'GM' }[lvl]}</div>
                                    </div>
                                    {ticket.escalation_level === lvl && <span style={{ marginLeft: 'auto', fontSize: 11, color: ESC_COLORS[lvl], fontWeight: 600 }}>● Current</span>}
                                </div>
                            ))}
                        </div>

                        {/* Escalation log */}
                        {logs.length > 0 && (
                            <div className="card">
                                <div className="card-title" style={{ marginBottom: 14 }}>Escalation Log</div>
                                <div className="timeline">
                                    {logs.map((l, i) => (
                                        <div key={l.id} className="timeline-item">
                                            <div className="timeline-line">
                                                <div className="timeline-dot" style={{ background: ESC_COLORS[l.escalation_level] }} />
                                                {i < logs.length - 1 && <div className="timeline-connector" />}
                                            </div>
                                            <div className="timeline-content">
                                                <div className="timeline-action">→ Level {l.escalation_level}: {l.from_name} → {l.to_name}</div>
                                                <div className="timeline-meta">{l.reason}</div>
                                                <div className="timeline-meta">{new Date(l.escalated_at).toLocaleString('en-IN')}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Activity log */}
                        <div className="card">
                            <div className="card-title" style={{ marginBottom: 14 }}>Activity Log</div>
                            {activity.length ? (
                                <div className="timeline">
                                    {activity.map((a, i) => (
                                        <div key={a.id} className="timeline-item">
                                            <div className="timeline-line">
                                                <div className="timeline-dot" />
                                                {i < activity.length - 1 && <div className="timeline-connector" />}
                                            </div>
                                            <div className="timeline-content">
                                                <div className="timeline-action" style={{ textTransform: 'capitalize' }}>{a.action.replace('_', ' ')}</div>
                                                <div className="timeline-meta">{a.note}</div>
                                                <div className="timeline-meta">{a.performed_by_name || 'System'} · {new Date(a.created_at).toLocaleString('en-IN')}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : <div className="empty-state" style={{ padding: 24 }}>No activity yet</div>}
                        </div>
                    </div>
                </div>
            </div>

            {/* Escalate modal */}
            {showEscModal && (
                <div className="modal-overlay" onClick={() => setShowEscModal(false)}>
                    <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--danger)' }}><polyline points="18 15 12 9 6 15" /></svg> Manual Escalation
                            </div>
                            <button className="modal-close" onClick={() => setShowEscModal(false)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
                            Escalate ticket <strong>{ticket.ticket_number}</strong> from Level {ticket.escalation_level} → Level {ticket.escalation_level + 1}.
                        </p>
                        <div className="form-group">
                            <label className="form-label">Reason (optional)</label>
                            <textarea className="input" rows={3} placeholder="Why are you escalating this ticket?" value={escalateReason} onChange={e => setEscalateReason(e.target.value)} />
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowEscModal(false)}>Cancel</button>
                            <button className="btn btn-danger" onClick={handleEscalate}>Escalate Now</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
