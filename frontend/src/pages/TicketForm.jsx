// src/pages/TicketForm.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

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

    const CATEGORIES = ['Technical Issue', 'Billing', 'Feature Request', 'Complaint', 'Account', 'Network', 'Hardware', 'Software', 'Access', 'Other']

    return (
        <>
            <Topbar title="Create New Ticket" subtitle="Fill all required fields to raise a support ticket"
                actions={<button className="btn btn-secondary btn-sm" onClick={() => navigate('/tickets')}>← Back</button>} />
            <div className="page-body">
                <div className="card" style={{ maxWidth: 800 }}>
                    <form onSubmit={handleSubmit}>
                        {/* Source */}
                        <div className="form-group mb-4">
                            <label className="form-label">Ticket Source</label>
                            <div className="flex gap-3">
                                {['manual', 'email', 'call'].map(s => (
                                    <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: form.source === s ? 'var(--accent)' : 'var(--text-secondary)' }}>
                                        <input type="radio" value={s} checked={form.source === s} onChange={() => set('source', s)} style={{ accentColor: 'var(--accent)' }} />
                                        {{ 'manual': '📝 Manual', 'email': '📧 Email', 'call': '📞 Call' }[s]}
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="form-grid mb-4">
                            <div className="form-group">
                                <label className="form-label">Customer <span>*</span></label>
                                <select className="input" value={form.customer_id} onChange={e => { set('customer_id', e.target.value); set('project_id', '') }} required>
                                    <option value="">Select customer…</option>
                                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Project <span>*</span></label>
                                <select className="input" value={form.project_id} onChange={e => set('project_id', e.target.value)} required disabled={!form.customer_id}>
                                    <option value="">Select project…</option>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="form-grid mb-4">
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
                                    {[['P1', 'P1 – Critical'], ['P2', 'P2 – High'], ['P3', 'P3 – Medium'], ['P4', 'P4 – Low'], ['P5', 'P5 – Very Low']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="form-group mb-4">
                            <label className="form-label">Description <span>*</span></label>
                            <textarea className="input" rows={5} placeholder="Describe the issue in detail…" value={form.description} onChange={e => set('description', e.target.value)} required />
                        </div>

                        <div className="form-grid mb-4">
                            <div className="form-group">
                                <label className="form-label">Assign To</label>
                                <select className="input" value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
                                    <option value="">Auto-assign (myself)</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Attachment</label>
                                <input type="file" onChange={e => setFile(e.target.files[0])} style={{ color: 'var(--text-secondary)', fontSize: 13 }} accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.txt,.xlsx,.csv" />
                                <div className="form-hint">Max 10MB. Supported: images, PDF, DOC, XLS, TXT</div>
                            </div>
                        </div>

                        {/* Priority indicator */}
                        <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
                            <span className={`priority-badge p${form.priority[1]}-badge`} style={{ fontSize: 13 }}>{form.priority}</span>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                SLA: Agent escalation after <strong>1 hour</strong> · TL after <strong>1h 30m</strong> · Manager after <strong>2 hours</strong>
                            </div>
                        </div>

                        <div className="btn-row">
                            <button className="btn btn-primary" type="submit" disabled={loading}>
                                {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} />Creating…</> : '🎫 Create Ticket'}
                            </button>
                            <button className="btn btn-secondary" type="button" onClick={() => navigate('/tickets')}>Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    )
}
