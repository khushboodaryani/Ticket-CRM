// src/pages/DomainApprovals.jsx
// Superadmin page for reviewing unknown-domain email approval requests.
// Approve → maps domain to customer/project and auto-creates tickets from all held emails.
// Reject → sends polite auto-reply to the sender.
import { useEffect, useState } from 'react'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import toast from 'react-hot-toast'

export default function DomainApprovals() {
    const [requests, setRequests] = useState([])
    const [customers, setCustomers] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('pending')

    // Approve modal state
    const [approveTarget, setApproveTarget] = useState(null) // approval request object
    const [approveForm, setApproveForm] = useState({ customer_id: '', project_id: '' })
    const [customerProjects, setCustomerProjects] = useState([])
    const [approving, setApproving] = useState(false)

    // Detail modal
    const [detailTarget, setDetailTarget] = useState(null)
    const [heldEmails, setHeldEmails] = useState([])
    const [detailLoading, setDetailLoading] = useState(false)

    // Reject state
    const [rejectTarget, setRejectTarget] = useState(null)
    const [rejectReason, setRejectReason] = useState('')
    const [rejecting, setRejecting] = useState(false)

    const load = () => {
        setLoading(true)
        Promise.all([
            api.get(`/approvals/domains?status=${filter}`),
            api.get('/customers')
        ]).then(([r, c]) => {
            setRequests(r.data.requests)
            setCustomers(c.data.customers)
        }).catch(() => {}).finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [filter])

    // Load projects when customer selected
    const onCustomerChange = async (customerId) => {
        setApproveForm(p => ({ ...p, customer_id: customerId, project_id: '' }))
        if (customerId) {
            try {
                const r = await api.get(`/projects?customer_id=${customerId}`)
                setCustomerProjects(r.data.projects)
            } catch { setCustomerProjects([]) }
        } else {
            setCustomerProjects([])
        }
    }

    const openApprove = (req) => {
        setApproveTarget(req)
        setApproveForm({ customer_id: '', project_id: '' })
        setCustomerProjects([])
    }

    const handleApprove = async (e) => {
        e.preventDefault()
        if (!approveForm.customer_id) return toast.error('Select a customer')
        setApproving(true)
        try {
            const r = await api.post(`/approvals/domains/${approveTarget.id}/approve`, approveForm)
            toast.success(r.data.message)
            setApproveTarget(null)
            load()
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to approve')
        }
        setApproving(false)
    }

    const openDetail = async (req) => {
        setDetailTarget(req)
        setDetailLoading(true)
        try {
            const r = await api.get(`/approvals/domains/${req.id}`)
            setDetailTarget(r.data.request)
            setHeldEmails(r.data.held_emails || [])
        } catch { toast.error('Failed to load details') }
        setDetailLoading(false)
    }

    const openReject = (req) => {
        setRejectTarget(req)
        setRejectReason('')
    }

    const handleReject = async () => {
        setRejecting(true)
        try {
            const r = await api.post(`/approvals/domains/${rejectTarget.id}/reject`, { reason: rejectReason })
            toast.success(r.data.message)
            setRejectTarget(null)
            load()
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to reject')
        }
        setRejecting(false)
    }

    const statusColor = (status) => {
        switch (status) {
            case 'pending': return { bg: 'rgba(251,191,36,0.15)', color: '#d97706' }
            case 'approved': return { bg: 'rgba(34,197,94,0.15)', color: '#16a34a' }
            case 'rejected': return { bg: 'rgba(239,68,68,0.15)', color: '#dc2626' }
            default: return { bg: 'transparent', color: 'inherit' }
        }
    }

    return (
        <>
            <Topbar title="Domain Approvals" subtitle="Review unknown email domains" />
            <div className="page-body">
                <div className="card">
                    <div className="filters-bar">
                        <div style={{ display: 'flex', gap: 8 }}>
                            {['pending', 'approved', 'rejected'].map(s => (
                                <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setFilter(s)} style={{ textTransform: 'capitalize' }}>
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Domain</th>
                                    <th>First Sender</th>
                                    <th>Subject</th>
                                    <th>Held Emails</th>
                                    <th>Status</th>
                                    <th>Received</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: 'auto' }} /></td></tr>
                                ) : requests.length === 0 ? (
                                    <tr><td colSpan={7} className="empty-row">No {filter} requests</td></tr>
                                ) : requests.map(req => {
                                    const sc = statusColor(req.status)
                                    return (
                                        <tr key={req.id}>
                                            <td>
                                                <span style={{
                                                    background: 'var(--bg-accent-subtle, rgba(79,142,247,0.12))',
                                                    color: 'var(--accent)', padding: '3px 10px', borderRadius: 12,
                                                    fontSize: 12, fontWeight: 600
                                                }}>
                                                    @{req.domain}
                                                </span>
                                            </td>
                                            <td style={{ fontSize: 13 }}>
                                                <div>{req.sender_name || req.sender_email}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{req.sender_email}</div>
                                            </td>
                                            <td style={{ fontSize: 12, maxWidth: 220 }} className="truncate">{req.email_subject || '—'}</td>
                                            <td>
                                                <span className="badge badge-in_progress">{req.held_email_count || 0}</span>
                                            </td>
                                            <td>
                                                <span style={{
                                                    background: sc.bg, color: sc.color,
                                                    padding: '3px 10px', borderRadius: 12, fontSize: 11,
                                                    fontWeight: 600, textTransform: 'uppercase'
                                                }}>
                                                    {req.status}
                                                </span>
                                                {req.status === 'approved' && req.approved_customer_name && (
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                                                        → {req.approved_customer_name}{req.approved_project_name ? ` / ${req.approved_project_name}` : ''}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                {new Date(req.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button className="btn btn-secondary btn-sm" onClick={() => openDetail(req)} title="View Details">
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                                    </button>
                                                    {req.status === 'pending' && (
                                                        <>
                                                            <button className="btn btn-primary btn-sm" onClick={() => openApprove(req)} style={{ fontSize: 11 }}>
                                                                Approve
                                                            </button>
                                                            <button className="btn btn-sm" onClick={() => openReject(req)}
                                                                style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)', fontSize: 11 }}>
                                                                Reject
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Approve Modal */}
            {approveTarget && (
                <div className="modal-overlay" onClick={() => setApproveTarget(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <div className="modal-title">Approve Domain</div>
                                <div style={{ fontSize: 13, color: 'var(--accent)', marginTop: 3, fontWeight: 600 }}>@{approveTarget.domain}</div>
                            </div>
                            <button className="modal-close" onClick={() => setApproveTarget(null)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleApprove}>
                            <div style={{ padding: '0 20px 12px' }}>
                                <div style={{ background: 'var(--bg-page)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
                                    <div><strong>From:</strong> {approveTarget.sender_name} ({approveTarget.sender_email})</div>
                                    <div style={{ marginTop: 4 }}><strong>Subject:</strong> {approveTarget.email_subject}</div>
                                    <div style={{ marginTop: 4 }}><strong>Held Emails:</strong> {approveTarget.held_email_count || 1}</div>
                                </div>
                            </div>
                            <div className="form-group" style={{ padding: '0 20px', marginBottom: 16 }}>
                                <label className="form-label">Map to Customer <span>*</span></label>
                                <select className="input" required value={approveForm.customer_id} onChange={e => onCustomerChange(e.target.value)}>
                                    <option value="">Select customer…</option>
                                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            {approveForm.customer_id && (
                                <div className="form-group" style={{ padding: '0 20px', marginBottom: 16 }}>
                                    <label className="form-label">Route to Project <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                                    <select className="input" value={approveForm.project_id} onChange={e => setApproveForm(p => ({ ...p, project_id: e.target.value }))}>
                                        <option value="">Customer Root (default level)</option>
                                        {customerProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                        {customerProjects.length === 0 
                                            ? `No projects defined. Emails from @${approveTarget.domain} will map to Customer Root.`
                                            : `Select a project or leave as Root to map all future emails from @${approveTarget.domain}.`
                                        }
                                    </div>
                                </div>
                            )}
                            <div style={{ padding: '0 20px 8px' }}>
                                <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: 12, fontSize: 12, color: '#16a34a' }}>
                                    ✓ Approving will: map the domain, create tickets from all held emails, and send acknowledgement emails.
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" type="button" onClick={() => setApproveTarget(null)}>Cancel</button>
                                <button className="btn btn-primary" type="submit" disabled={approving}>
                                    {approving ? 'Approving…' : 'Approve & Create Tickets'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {detailTarget && (
                <div className="modal-overlay" onClick={() => setDetailTarget(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 650 }}>
                        <div className="modal-header">
                            <div>
                                <div className="modal-title">Request Detail</div>
                                <div style={{ fontSize: 13, color: 'var(--accent)', marginTop: 3, fontWeight: 600 }}>@{detailTarget.domain}</div>
                            </div>
                            <button className="modal-close" onClick={() => setDetailTarget(null)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>
                        <div style={{ padding: '0 20px 20px', maxHeight: 500, overflowY: 'auto' }}>
                            {detailLoading ? (
                                <div style={{ textAlign: 'center', padding: 30 }}><div className="spinner" style={{ margin: 'auto' }} /></div>
                            ) : (
                                <>
                                    {/* First email */}
                                    <div style={{ background: 'var(--bg-page)', padding: 14, borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                                        <div><strong>First Sender:</strong> {detailTarget.sender_name} &lt;{detailTarget.sender_email}&gt;</div>
                                        <div style={{ marginTop: 4 }}><strong>Subject:</strong> {detailTarget.email_subject}</div>
                                        <div style={{ marginTop: 4 }}><strong>Status:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{detailTarget.status}</span></div>
                                        {detailTarget.reviewed_by_name && (
                                            <div style={{ marginTop: 4 }}><strong>Reviewed by:</strong> {detailTarget.reviewed_by_name} at {new Date(detailTarget.reviewed_at).toLocaleString('en-IN')}</div>
                                        )}
                                    </div>

                                    {/* Email body preview */}
                                    {detailTarget.email_body && (
                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>Email Body</div>
                                            <div style={{
                                                background: 'var(--bg-page)', padding: 12, borderRadius: 6,
                                                borderLeft: '3px solid var(--accent)', fontSize: 12,
                                                whiteSpace: 'pre-wrap', maxHeight: 150, overflowY: 'auto',
                                                color: 'var(--text-secondary)'
                                            }}>
                                                {detailTarget.email_body}
                                            </div>
                                        </div>
                                    )}

                                    {/* Held Emails */}
                                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
                                        Held Emails ({heldEmails.length})
                                    </div>
                                    {heldEmails.length === 0 ? (
                                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No held emails</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {heldEmails.map((he, i) => (
                                                <div key={he.id} style={{
                                                    background: 'var(--bg-page)', padding: 10, borderRadius: 6,
                                                    fontSize: 12, borderLeft: he.processed_at ? '3px solid #22c55e' : '3px solid #fbbf24'
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <strong>{he.sender_name || he.sender_email}</strong>
                                                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                                            {new Date(he.received_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{he.subject}</div>
                                                    {he.processed_at && (
                                                        <div style={{ color: '#16a34a', fontSize: 11, marginTop: 4 }}>✓ Ticket created</div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Reject Modal */}
            {rejectTarget && (
                <div className="modal-overlay" onClick={() => setRejectTarget(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                        <div className="modal-header">
                            <div className="modal-title">Reject Domain</div>
                            <button className="modal-close" onClick={() => setRejectTarget(null)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>
                        <div style={{ padding: '0 20px' }}>
                            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: 12, fontSize: 12, color: '#dc2626', marginBottom: 16 }}>
                                Rejecting <strong>@{rejectTarget.domain}</strong> will send a polite auto-reply to all senders notifying them their message could not be delivered.
                            </div>
                            <div className="form-group" style={{ marginBottom: 16 }}>
                                <label className="form-label">Reason <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                                <textarea className="input" rows={2} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                                    placeholder="Internal note — not shown to sender" />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setRejectTarget(null)}>Cancel</button>
                            <button className="btn btn-sm" onClick={handleReject} disabled={rejecting}
                                style={{ background: '#dc2626', color: 'white', border: 'none', padding: '8px 20px' }}>
                                {rejecting ? 'Rejecting…' : 'Reject & Notify Sender'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
