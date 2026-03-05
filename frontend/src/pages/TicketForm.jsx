// src/pages/TicketForm.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const CATEGORIES = [
    'Technical Issue', 'Billing', 'Feature Request', 'Complaint',
    'Account', 'Network', 'Hardware', 'Software', 'Access', 'Other'
]

const PRIORITY_INFO = {
    P1: { label: 'P1 – Critical', color: '#ef4444', sla: 'Escalates in 30 min' },
    P2: { label: 'P2 – High', color: '#f97316', sla: 'Escalates in 1 hour' },
    P3: { label: 'P3 – Medium', color: '#f59e0b', sla: 'Escalates in 2 hours' },
    P4: { label: 'P4 – Low', color: '#22c55e', sla: 'Escalates in 4 hours' },
    P5: { label: 'P5 – Very Low', color: '#6b7280', sla: 'Escalates in 8 hours' },
}

const SOURCES = [
    { value: 'manual', icon: '✍', label: 'Manual' },
    { value: 'email', icon: '✉', label: 'Email' },
    { value: 'phone', icon: '📞', label: 'Phone Call' },
    { value: 'csv', icon: '📋', label: 'CSV Import' },
]

export default function TicketForm() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const [customers, setCustomers] = useState([])
    const [projects, setProjects] = useState([])
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(false)
    const [form, setForm] = useState({
        customer_id: '', project_id: '', category: '', priority: 'P3',
        description: '', source: 'manual', assigned_to: ''
    })
    const [file, setFile] = useState(null)

    useEffect(() => {
        api.get('/customers').then(r => setCustomers(r.data.customers))
        api.get('/users', { params: { role: 'agent' } }).then(r => setUsers(r.data.users))
    }, [])

    useEffect(() => {
        if (form.customer_id) {
            api.get('/projects', { params: { customer_id: form.customer_id } }).then(r => setProjects(r.data.projects))
        } else { setProjects([]) }
    }, [form.customer_id])

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.customer_id || !form.project_id || !form.category || !form.description)
            return toast.error('Please fill all required fields.')
        setLoading(true)
        try {
            const fd = new FormData()
            Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v) })
            if (file) fd.append('attachment', file)
            const { data } = await api.post('/tickets', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
            toast.success(`Ticket ${data.ticket_number} created!`)
            navigate(`/tickets/${data.ticketId}`)
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to create ticket') }
        setLoading(false)
    }

    const pInfo = PRIORITY_INFO[form.priority]

    return (
        <>
            <Topbar
                title="Create Ticket"
                subtitle="Fill all required fields to raise a support ticket"
                actions={<button className="btn btn-secondary btn-sm" onClick={() => navigate('/tickets')}>← Back to Tickets</button>}
            />
            <div className="page-body">
                <form onSubmit={handleSubmit} style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* ── Source selector ── */}
                    <div className="card" style={{ padding: '20px 24px' }}>
                        <div className="card-title" style={{ marginBottom: 14 }}>
                            <span style={{ marginRight: 8 }}>📡</span> Ticket Source
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {SOURCES.map(s => (
                                <button
                                    key={s.value}
                                    type="button"
                                    onClick={() => set('source', s.value)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '9px 18px',
                                        borderRadius: 10,
                                        border: `1.5px solid ${form.source === s.value ? 'var(--accent)' : 'var(--border)'}`,
                                        background: form.source === s.value ? 'var(--accent-light)' : 'var(--bg-input)',
                                        color: form.source === s.value ? 'var(--accent)' : 'var(--text-secondary)',
                                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                        transition: 'all 0.18s',
                                    }}
                                >
                                    <span style={{ fontSize: 15 }}>{s.icon}</span>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Customer & Project ── */}
                    <div className="card" style={{ padding: '20px 24px' }}>
                        <div className="card-title" style={{ marginBottom: 16 }}>
                            <span style={{ marginRight: 8 }}>🏢</span> Customer & Project
                        </div>
                        <div className="form-grid">
                            <div className="form-group">
                                <label className="form-label">Customer <span>*</span></label>
                                <select className="input" value={form.customer_id}
                                    onChange={e => { set('customer_id', e.target.value); set('project_id', '') }} required>
                                    <option value="">Select customer…</option>
                                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Project <span>*</span></label>
                                <select className="input" value={form.project_id}
                                    onChange={e => set('project_id', e.target.value)} required disabled={!form.customer_id}>
                                    <option value="">{form.customer_id ? 'Select project…' : 'Select customer first'}</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* ── Category & Priority ── */}
                    <div className="card" style={{ padding: '20px 24px' }}>
                        <div className="card-title" style={{ marginBottom: 16 }}>
                            <span style={{ marginRight: 8 }}>🏷️</span> Classification
                        </div>
                        <div className="form-grid" style={{ marginBottom: 16 }}>
                            <div className="form-group">
                                <label className="form-label">Category <span>*</span></label>
                                <select className="input" value={form.category} onChange={e => set('category', e.target.value)} required>
                                    <option value="">Select category…</option>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Priority <span>*</span></label>
                                <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)} required>
                                    {Object.entries(PRIORITY_INFO).map(([v, p]) =>
                                        <option key={v} value={v}>{p.label}</option>
                                    )}
                                </select>
                            </div>
                        </div>

                        {/* Priority SLA indicator bar */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 14,
                            background: 'var(--bg-input)', borderRadius: 10,
                            padding: '12px 16px', border: `1px solid ${pInfo.color}30`
                        }}>
                            <div style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: pInfo.color, flexShrink: 0,
                                boxShadow: `0 0 8px ${pInfo.color}60`
                            }} />
                            <span className={`priority-badge p${form.priority[1]}-badge`}>{form.priority}</span>
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                SLA: <strong>{pInfo.sla}</strong> · Agent → TL → Manager → GM
                            </span>
                        </div>
                    </div>

                    {/* ── Description ── */}
                    <div className="card" style={{ padding: '20px 24px' }}>
                        <div className="card-title" style={{ marginBottom: 16 }}>
                            <span style={{ marginRight: 8 }}>📝</span> Issue Description
                        </div>
                        <div className="form-group">
                            <label className="form-label">Description <span>*</span></label>
                            <textarea
                                className="input"
                                rows={5}
                                placeholder="Describe the issue in detail — include error messages, steps to reproduce, and any relevant details…"
                                value={form.description}
                                onChange={e => set('description', e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {/* ── Assignment & Attachment ── */}
                    <div className="card" style={{ padding: '20px 24px' }}>
                        <div className="card-title" style={{ marginBottom: 16 }}>
                            <span style={{ marginRight: 8 }}>👤</span> Assignment & Attachment
                        </div>
                        <div className="form-grid">
                            <div className="form-group">
                                <label className="form-label">Assign To</label>
                                <select className="input" value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
                                    <option value="">Auto-assign (myself)</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                                <div className="form-hint">Leave blank to auto-assign to yourself</div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Attachment</label>
                                <div style={{
                                    border: '2px dashed var(--border)', borderRadius: 10,
                                    padding: '14px 16px', background: 'var(--bg-input)',
                                    display: 'flex', flexDirection: 'column', gap: 6,
                                    cursor: 'pointer', transition: 'border-color 0.18s'
                                }}
                                    onClick={() => document.getElementById('tf-file').click()}
                                >
                                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 18 }}>📎</span>
                                        {file ? (
                                            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{file.name}</span>
                                        ) : (
                                            <span>Click to upload file</span>
                                        )}
                                    </div>
                                    <input
                                        id="tf-file"
                                        type="file"
                                        style={{ display: 'none' }}
                                        onChange={e => setFile(e.target.files[0])}
                                        accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.txt,.xlsx,.csv"
                                    />
                                </div>
                                <div className="form-hint">Max 10MB · JPG, PNG, PDF, DOC, XLS, TXT</div>
                            </div>
                        </div>
                    </div>

                    {/* ── Submit ── */}
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingBottom: 8 }}>
                        <button
                            className="btn btn-primary"
                            type="submit"
                            disabled={loading}
                            style={{ minWidth: 160, justifyContent: 'center' }}
                        >
                            {loading
                                ? <><span className="spinner" style={{ width: 14, height: 14 }} />Creating…</>
                                : <>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
                                    Create Ticket
                                </>
                            }
                        </button>
                        <button className="btn btn-secondary" type="button" onClick={() => navigate('/tickets')}>
                            Cancel
                        </button>
                    </div>

                </form>
            </div>
        </>
    )
}
