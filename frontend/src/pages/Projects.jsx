// src/pages/Projects.jsx
import { useEffect, useState } from 'react'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import toast from 'react-hot-toast'

export default function Projects() {
    const [projects, setProjects] = useState([])
    const [customers, setCustomers] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editItem, setEditItem] = useState(null)
    const [form, setForm] = useState({ 
        customer_id: '', name: '', project_code: '', description: '', domain: '',
        resolution_time_hours: '', response_time_sec: '' 
    })
    const [saving, setSaving] = useState(false)
    const [search, setSearch] = useState('')

    const load = () => {
        setLoading(true)
        Promise.all([api.get('/projects'), api.get('/customers')]).then(([p, c]) => {
            setProjects(p.data.projects); setCustomers(c.data.customers)
        }).finally(() => setLoading(false))
    }
    useEffect(() => { load() }, [])

    const openCreate = () => { 
        setEditItem(null); 
        setForm({ 
            customer_id: '', name: '', project_code: '', description: '', domain: '',
            resolution_time_hours: '', response_time_sec: ''
        }); 
        setShowModal(true) 
    }
    const openEdit = (p) => { 
        setEditItem(p); 
        setForm({ 
            customer_id: p.customer_id || '', 
            name: p.name, 
            project_code: p.project_code || '', 
            description: p.description || '', 
            domain: p.domain || '',
            resolution_time_hours: p.resolution_time_hours || '',
            response_time_sec: p.response_time_sec || ''
        }); 
        setShowModal(true) 
    }

    const handleDelete = async (p) => {
        if (!confirm(`Delete project "${p.name}"? This will also delete all associated tickets. This action cannot be undone.`)) return
        try {
            await api.delete(`/projects/${p.id}`)
            toast.success('Project deleted')
            load()
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to delete') }
    }

    const handleSave = async (e) => {
        e.preventDefault(); setSaving(true)
        try {
            if (editItem) await api.put(`/projects/${editItem.id}`, form)
            else await api.post('/projects', form)
            toast.success(editItem ? 'Project updated!' : 'Project created!')
            setShowModal(false); load()
        } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
        setSaving(false)
    }

    const filtered = projects.filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.customer_name?.toLowerCase().includes(search.toLowerCase()))

    return (
        <>
            <Topbar title="Projects" subtitle={`${projects.length} projects`}
                actions={<button className="btn btn-primary btn-sm" onClick={openCreate}>+ Add Project</button>} />
            <div className="page-body">
                <div className="card">
                    <div className="filters-bar">
                        <div className="search-box">
                            <span className="search-icon">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                            </span>
                            <input className="search-input" placeholder="Search by project or customer name…" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                    </div>
                    <div className="table-wrap">
                        <table>
                            <thead><tr><th>Project</th><th>Code</th><th>Customer</th><th>Domain</th><th>Tickets</th><th>Description</th><th>Created</th><th>Actions</th></tr></thead>
                            <tbody>
                                {loading ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: 'auto' }} /></td></tr>
                                    : filtered.length === 0 ? <tr><td colSpan={8} className="empty-row">No projects found</td></tr>
                                        : filtered.map(p => (
                                            <tr key={p.id}>
                                                <td><strong>{p.name}</strong></td>
                                                <td><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)' }}>{p.project_code || '—'}</span></td>
                                                <td style={{ fontSize: 13 }}>{p.customer_name}</td>
                                                <td>
                                                    {p.domain ? (
                                                        <span style={{
                                                            background: 'var(--bg-accent-subtle, rgba(79,142,247,0.12))',
                                                            color: 'var(--accent)',
                                                            padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500
                                                        }}>
                                                            @{p.domain}
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                                                    )}
                                                </td>
                                                <td><span className="badge badge-in_progress">{p.ticket_count}</span></td>
                                                <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200 }} className="truncate">{p.description || '—'}</td>
                                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(p.created_at).toLocaleDateString('en-IN')}</td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>Edit</button>
                                                        <button className="btn btn-sm" onClick={() => handleDelete(p)} title="Delete Project"
                                                            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '4px 8px' }}>
                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-title">{editItem ? 'Edit Project' : 'Add Project'}</div>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="form-grid" style={{ marginBottom: 16 }}>
                                <div className="form-group">
                                    <label className="form-label">Customer <span>*</span></label>
                                    <select className="input" required value={form.customer_id} onChange={e => setForm(p => ({ ...p, customer_id: e.target.value }))}>
                                        <option value="">Select customer…</option>
                                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Project Name <span>*</span></label>
                                    <input className="input" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Project Alpha" />
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: 16 }}>
                                <label className="form-label">Project Domain <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                                <input className="input" value={form.domain} onChange={e => setForm(p => ({ ...p, domain: e.target.value }))} placeholder="e.g. shams.multycomm.com" />
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                    Emails from this domain will automatically create tickets under this project
                                </div>
                            </div>
                            <div style={{ background: 'var(--bg-app)', padding: 16, borderRadius: 16, border: '1px solid var(--border)', marginBottom: 20 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>SLA Policy Override (Optional)</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                    <div className="form-group">
                                        <label className="form-label">Resolution Window (Hrs)</label>
                                        <input type="number" className="input" value={form.resolution_time_hours} onChange={e => setForm(p => ({ ...p, resolution_time_hours: e.target.value }))} placeholder="e.g. 1.0" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Response Time (Sec)</label>
                                        <input type="number" className="input" value={form.response_time_sec} onChange={e => setForm(p => ({ ...p, response_time_sec: e.target.value }))} placeholder="e.g. 120" />
                                    </div>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                                    If set, this project's contracts will override Customer and Global SLAs.
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: 20 }}>
                                <label className="form-label">Description</label>
                                <textarea className="input" rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Project details…" />
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" type="button" onClick={() => setShowModal(false)}>Cancel</button>
                                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : editItem ? 'Update' : 'Create'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
