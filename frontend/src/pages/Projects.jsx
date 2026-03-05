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
    const [form, setForm] = useState({ customer_id: '', name: '', project_code: '', description: '' })
    const [saving, setSaving] = useState(false)
    const [search, setSearch] = useState('')

    const load = () => {
        setLoading(true)
        Promise.all([api.get('/projects'), api.get('/customers')]).then(([p, c]) => {
            setProjects(p.data.projects); setCustomers(c.data.customers)
        }).finally(() => setLoading(false))
    }
    useEffect(() => { load() }, [])

    const openCreate = () => { setEditItem(null); setForm({ customer_id: '', name: '', project_code: '', description: '' }); setShowModal(true) }
    const openEdit = (p) => { setEditItem(p); setForm({ customer_id: p.customer_id || '', name: p.name, project_code: p.project_code || '', description: p.description || '' }); setShowModal(true) }

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
                            <thead><tr><th>Project</th><th>Code</th><th>Customer</th><th>Tickets</th><th>Description</th><th>Created</th><th>Actions</th></tr></thead>
                            <tbody>
                                {loading ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: 'auto' }} /></td></tr>
                                    : filtered.length === 0 ? <tr><td colSpan={7} className="empty-row">No projects found</td></tr>
                                        : filtered.map(p => (
                                            <tr key={p.id}>
                                                <td><strong>{p.name}</strong></td>
                                                <td><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)' }}>{p.project_code || '—'}</span></td>
                                                <td style={{ fontSize: 13 }}>{p.customer_name}</td>
                                                <td><span className="badge badge-in_progress">{p.ticket_count}</span></td>
                                                <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200 }} className="truncate">{p.description || '—'}</td>
                                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(p.created_at).toLocaleDateString('en-IN')}</td>
                                                <td><button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>Edit</button></td>
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
                                <label className="form-label">Project Code</label>
                                <input className="input" value={form.project_code} onChange={e => setForm(p => ({ ...p, project_code: e.target.value }))} placeholder="PROJ-001" />
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
