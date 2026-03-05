// src/pages/Customers.jsx
import { useEffect, useState } from 'react'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import toast from 'react-hot-toast'

export default function Customers() {
    const [customers, setCustomers] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editItem, setEditItem] = useState(null)
    const [form, setForm] = useState({ name: '', email: '', phone: '', customer_code: '', address: '' })
    const [saving, setSaving] = useState(false)
    const [search, setSearch] = useState('')

    const load = () => {
        setLoading(true)
        api.get('/customers').then(r => setCustomers(r.data.customers)).finally(() => setLoading(false))
    }
    useEffect(() => { load() }, [])

    const openCreate = () => { setEditItem(null); setForm({ name: '', email: '', phone: '', customer_code: '', address: '' }); setShowModal(true) }
    const openEdit = (c) => { setEditItem(c); setForm({ name: c.name, email: c.email || '', phone: c.phone || '', customer_code: c.customer_code || '', address: c.address || '' }); setShowModal(true) }

    const handleSave = async (e) => {
        e.preventDefault(); setSaving(true)
        try {
            if (editItem) await api.put(`/customers/${editItem.id}`, form)
            else await api.post('/customers', form)
            toast.success(editItem ? 'Customer updated!' : 'Customer created!')
            setShowModal(false); load()
        } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
        setSaving(false)
    }

    const filtered = customers.filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.customer_code?.toLowerCase().includes(search.toLowerCase()))

    return (
        <>
            <Topbar title="Customers" subtitle={`${customers.length} customers`}
                actions={<button className="btn btn-primary btn-sm" onClick={openCreate}>+ Add Customer</button>} />
            <div className="page-body">
                <div className="card">
                    <div className="filters-bar">
                        <div className="search-box">
                            <span className="search-icon">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                            </span>
                            <input className="search-input" placeholder="Search by name or code…" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                    </div>
                    <div className="table-wrap">
                        <table>
                            <thead><tr><th>Customer</th><th>Code</th><th>Email</th><th>Phone</th><th>Projects</th><th>Added</th><th>Actions</th></tr></thead>
                            <tbody>
                                {loading ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: 'auto' }} /></td></tr>
                                    : filtered.length === 0 ? <tr><td colSpan={7} className="empty-row">No customers found</td></tr>
                                        : filtered.map(c => (
                                            <tr key={c.id}>
                                                <td><strong>{c.name}</strong></td>
                                                <td><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)' }}>{c.customer_code || '—'}</span></td>
                                                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{c.email || '—'}</td>
                                                <td style={{ fontSize: 13 }}>{c.phone || '—'}</td>
                                                <td><span className="badge badge-in_progress">{c.project_count}</span></td>
                                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(c.created_at).toLocaleDateString('en-IN')}</td>
                                                <td><button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>Edit</button></td>
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
                            <div className="modal-title">{editItem ? 'Edit Customer' : 'Add Customer'}</div>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="form-grid" style={{ marginBottom: 16 }}>
                                <div className="form-group">
                                    <label className="form-label">Company Name <span>*</span></label>
                                    <input className="input" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Acme Corp" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Customer Code</label>
                                    <input className="input" value={form.customer_code} onChange={e => setForm(p => ({ ...p, customer_code: e.target.value }))} placeholder="CUST-001" />
                                </div>
                            </div>
                            <div className="form-grid" style={{ marginBottom: 16 }}>
                                <div className="form-group">
                                    <label className="form-label">Email</label>
                                    <input className="input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="contact@company.com" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Phone</label>
                                    <input className="input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" />
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: 20 }}>
                                <label className="form-label">Address</label>
                                <textarea className="input" rows={2} value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Registered address…" />
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
