// src/pages/TicketForm.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

// Dynamic categories will be fetched from /api/sla/categories
const DEFAULT_CATEGORIES = []


const getPriorityColor = (p, priorities = []) => {
    const found = priorities.find(x => x.name === p)
    return found?.color_code || '#64748b'
}

const formatResponseSec = (sec) => {
    if (!sec || sec <= 0) return '—'
    if (sec < 60) return `${sec} sec`
    if (sec < 3600) return `${Math.round(sec / 60)} min`
    return `${(sec / 3600).toFixed(1).replace(/\.0$/, '')} hr`
}

const ICON_MAIL = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
const ICON_PHONE = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
const ICON_USER = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>

const SOURCES = [
    { value: 'manual', icon: ICON_USER, label: 'Manual' },
    { value: 'email', icon: ICON_MAIL, label: 'Email' },
    { value: 'call', icon: ICON_PHONE, label: 'Phone Call' },
]

const ICON_BUILDING = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><line x1="9" y1="22" x2="9" y2="22" /><line x1="15" y1="22" x2="15" y2="22" /><line x1="8" y1="6" x2="8" y2="6" /><line x1="12" y1="6" x2="12" y2="6" /><line x1="16" y1="6" x2="16" y2="6" /><line x1="8" y1="10" x2="8" y2="10" /><line x1="12" y1="10" x2="12" y2="10" /><line x1="16" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="8" y2="14" /><line x1="12" y1="14" x2="12" y2="14" /><line x1="16" y1="14" x2="16" y2="14" /><line x1="8" y1="18" x2="8" y2="18" /><line x1="12" y1="18" x2="12" y2="18" /><line x1="16" y1="18" x2="16" y2="18" /></svg>
const ICON_TAG = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
const ICON_FILETEXT = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
const ICON_USER_SEC = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
const ICON_CLIP = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
const ICON_LAYERS = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>

export default function TicketForm() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const [customers, setCustomers] = useState([])
    const [projects, setProjects] = useState([])
    const [users, setUsers] = useState([])
    const [priorities, setPriorities] = useState([])
    const [form, setForm] = useState({
        customer_id: '', project_id: '', category: '', priority: '',
        description: '', source: 'manual', assigned_to: '', queue_id: ''
    })
    const [categories, setCategories] = useState([])

    const [file, setFile] = useState(null)
    const [slaPolicies, setSlaPolicies] = useState([])
    const [queues, setQueues] = useState([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        api.get('/customers').then(r => setCustomers(r.data.customers))
        api.get('/users', { params: { role: 'agent' } }).then(r => setUsers(r.data.users))
        api.get('/queues').then(r => setQueues(r.data.queues || []))
        api.get('/sla/categories').then(r => {
            const cats = r.data.categories || []
            setCategories(cats)
            // Initial default category pick
            if (cats.length > 0) set('category', cats[0].name)
        })
        api.get('/sla/priorities').then(r => {
            const prios = r.data.priorities || []
            setPriorities(prios)
            // We'll set the priority based on the category in a separate effect or here if we have both
        })
    }, [])

    // Synchronize Priority when Category changes
    useEffect(() => {
        if (form.category && priorities.length > 0) {
            const filtered = priorities.filter(p => p.category === form.category)
            if (filtered.length > 0) {
                // If current priority isn't in this category, pick the first one
                const currentInFiltered = filtered.find(p => p.name === form.priority)
                if (!currentInFiltered) {
                    set('priority', filtered[0].name)
                }
            }
        }
    }, [form.category, priorities])

    useEffect(() => {
        if (form.customer_id) {
            api.get('/projects', { params: { customer_id: form.customer_id } }).then(r => setProjects(r.data.projects))
        } else {
            setProjects([])
        }
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

    const pColor = getPriorityColor(form.priority)
    const pPolicy = slaPolicies.find(p => p.priority === form.priority)
    const slaDetail = pPolicy
        ? `Response ${formatResponseSec(pPolicy.response_time_sec)} · Escalates in ${pPolicy.escalation_1_min} min`
        : `No SLA policy configured`

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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ display: 'flex' }}>{s.icon}</span>
                                        {s.label}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Customer & Project ── */}
                    <div className="card" style={{ padding: '20px 24px' }}>
                        <div className="card-title" style={{ marginBottom: 16 }}>
                            <span style={{ marginRight: 10, color: 'var(--accent)', display: 'flex' }}>{ICON_BUILDING}</span> Customer & Project
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
                            <span style={{ marginRight: 10, color: 'var(--accent)', display: 'flex' }}>{ICON_TAG}</span> Classification
                        </div>
                        <div className="form-grid" style={{ marginBottom: 16 }}>
                            <div className="form-group">
                                <label className="form-label">Category <span>*</span></label>
                                <select className="input" value={form.category} 
                                    onChange={e => set('category', e.target.value)} required>
                                    <option value="">Select category…</option>
                                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Priority <span>*</span></label>
                                <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)} required>
                                    {priorities
                                        .filter(p => !form.category || p.category === form.category)
                                        .map(p => (
                                            <option key={p.name} value={p.name}>{p.name}</option>
                                        ))
                                    }
                                </select>
                            </div>
                        </div>

                        {/* Priority SLA indicator bar */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 14,
                            background: 'var(--bg-input)', borderRadius: 10,
                            padding: '12px 16px', border: `1px solid ${getPriorityColor(form.priority, priorities)}30`
                        }}>
                            <div style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: getPriorityColor(form.priority, priorities), flexShrink: 0,
                                boxShadow: `0 0 8px ${getPriorityColor(form.priority, priorities)}60`
                            }} />
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                                background: `${getPriorityColor(form.priority, priorities)}20`, 
                                color: getPriorityColor(form.priority, priorities), 
                                border: `1px solid ${getPriorityColor(form.priority, priorities)}40`
                            }}>{form.priority}</span>
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                SLA: <strong>{slaDetail}</strong> · Agent → TL → Manager → GM
                            </span>
                        </div>
                    </div>

                    {/* ── Description ── */}
                    <div className="card" style={{ padding: '20px 24px' }}>
                        <div className="card-title" style={{ marginBottom: 16 }}>
                            <span style={{ marginRight: 10, color: 'var(--accent)', display: 'flex' }}>{ICON_FILETEXT}</span> Issue Description
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

                    {/* ── Assignment, Queue & Attachment ── */}
                    <div className="card" style={{ padding: '20px 24px' }}>
                        <div className="card-title" style={{ marginBottom: 16 }}>
                            <span style={{ marginRight: 10, color: 'var(--accent)', display: 'flex' }}>{ICON_USER_SEC}</span> Assignment & Routing
                        </div>
                        <div className="form-grid" style={{ marginBottom: 20 }}>
                            <div className="form-group">
                                <label className="form-label">Assign To</label>
                                <select className="input" value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
                                    <option value="">Auto-assign (System)</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                                <div className="form-hint">Leave blank for automatic smart-routing</div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Service Queue</label>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <div style={{ color: 'var(--accent)', display: 'flex' }}>{ICON_LAYERS}</div>
                                    <select className="input" value={form.queue_id} onChange={e => set('queue_id', e.target.value)}>
                                        <option value="">No Queue (Unassigned Routing)</option>
                                        {queues.map(q => <option key={q.id} value={q.id}>{q.name} ({q.sla_hours}h SLA)</option>)}
                                    </select>
                                </div>
                                <div className="form-hint">Tickets will be routed to this queue's agents</div>
                            </div>
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
                                    <span style={{ display: 'flex' }}>{ICON_CLIP}</span>
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
