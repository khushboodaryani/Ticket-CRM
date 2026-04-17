// src/pages/Customers.jsx
import { useEffect, useState } from 'react'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import toast from 'react-hot-toast'

export default function Customers() {
    const [customers, setCustomers] = useState([])
    const [projects, setProjects] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editItem, setEditItem] = useState(null)
    const [form, setForm] = useState({ 
        name: '', email: '', phone: '', customer_code: '', address: '', default_project_id: ''
    })
    const [customerSlas, setCustomerSlas] = useState([])
    const [slaLoading, setSlaLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [search, setSearch] = useState('')

    // Domain management
    const [showDomainModal, setShowDomainModal] = useState(null) // customer object or null
    const [domainForm, setDomainForm] = useState({ domain: '', project_id: '' })
    const [domainSaving, setDomainSaving] = useState(false)
    const [customerProjects, setCustomerProjects] = useState([])

    const load = () => {
        setLoading(true)
        api.get('/customers').then(r => setCustomers(r.data.customers)).finally(() => setLoading(false))
    }
    useEffect(() => { load() }, [])

    const loadDefaultsForNew = async () => {
        setSlaLoading(true)
        try {
            const r = await api.get('/sla/customer/0')
            // Initialize with enabled: false by default, or true for P1/Q1?
            // Let's go with false but allow user to check them.
            const initial = (r.data.policies || []).map(p => ({ ...p, enabled: false }))
            setCustomerSlas(initial)
        } catch { toast.error("Failed to load SLA defaults") }
        setSlaLoading(false)
    }

    const openCreate = () => {
        setEditItem(null)
        setForm({ 
            name: '', email: '', phone: '', customer_code: '', address: '', default_project_id: ''
        })
        loadDefaultsForNew()
        setShowModal(true)
    }

    const openEdit = (c) => {
        setEditItem(c)
        setForm({
            name: c.name, email: c.email || '', phone: c.phone || '',
            customer_code: c.customer_code || '', address: c.address || '',
            default_project_id: c.default_project_id || ''
        })
        // Load projects for this customer
        api.get(`/projects?customer_id=${c.id}`).then(r => setProjects(r.data.projects)).catch(() => {})
        
        // Load granular SLAs
        fetchCustomerSlas(c.id)
        setShowModal(true)
    }

    const fetchCustomerSlas = async (cid) => {
        setSlaLoading(true)
        try {
            const r = await api.get(`/sla/customer/${cid}`)
            // For editing, if is_overridden is true, it's enabled
            setCustomerSlas((r.data.policies || []).map(p => ({ ...p, enabled: p.is_overridden })))
        } catch { toast.error("Failed to load customer SLA overrides") }
        setSlaLoading(false)
    }

    const handleSlaOverrideChange = (prioId, field, value) => {
        setCustomerSlas(prev => prev.map(s => {
            if (s.priority_id !== prioId) return s;
            // Handle checkbox separately
            if (field === 'enabled') {
                return { ...s, enabled: value };
            }
            let val = parseFloat(value) || 0;
            // Handle minutes conversion
            if (field === 'response_mins') {
                 return { ...s, first_response_hrs: val / 60, is_overridden: true };
            }
            return { ...s, [field]: val, is_overridden: true };
        }))
    }

    const saveSlaOverride = async (sla) => {
        try {
            await api.post(`/sla/customer/${editItem.id}`, {
                priority_id: sla.priority_id,
                resolution_time_hours: sla.resolution_time_hours,
                first_response_hrs: sla.first_response_hrs
            })
            toast.success(`SLA for ${sla.priority_name} updated`)
        } catch { toast.error("Failed to save SLA override") }
    }

    const handleSave = async (e) => {
        e.preventDefault(); setSaving(true)
        try {
            if (editItem) {
                await api.put(`/customers/${editItem.id}`, form)
            } else {
                // Bulk save ONLY enabled overrides for new customers
                const payload = {
                    ...form,
                    sla_overrides: customerSlas.filter(s => s.enabled).map(s => ({
                        priority_id: s.priority_id,
                        resolution_hrs: s.resolution_time_hours,
                        first_response_hrs: s.first_response_hrs
                    }))
                }
                await api.post('/customers', payload)
            }
            toast.success(editItem ? 'Customer updated!' : 'Customer created!')
            setShowModal(false); load()
        } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
        setSaving(false)
    }

    const renderSlaOverrides = () => (
        <div style={{ background: 'var(--bg-app)', padding: 16, borderRadius: 16, border: '1px solid var(--border)', marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                Categorical SLA Policy {editItem ? 'Overrides' : 'Configuration'}
            </div>
            <div className="table-wrap" style={{ border: 'none', background: 'transparent' }}>
                <table style={{ fontSize: 12 }}>
                    <thead>
                        <tr>
                            <th style={{ width: 30 }}></th>
                            <th>Priority Tier</th>
                            <th>Resolution (Hrs)</th>
                            <th>Response (Min)</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {slaLoading ? <tr><td colSpan={5} style={{ textAlign: 'center' }}>Loading tiers...</td></tr> :
                         customerSlas.map(s => (
                            <tr key={s.priority_id} style={{ opacity: s.enabled ? 1 : 0.6, transition: 'opacity 0.2s' }}>
                                <td>
                                    <input 
                                        type="checkbox" 
                                        checked={s.enabled} 
                                        onChange={e => handleSlaOverrideChange(s.priority_id, 'enabled', e.target.checked)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                </td>
                                <td>
                                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {s.priority_name}
                                        <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 4, background: 'var(--bg-input)', color: 'var(--text-muted)' }}>{s.prefix}</span>
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.category_name}</div>
                                </td>
                                <td>
                                    <input 
                                        type="number" step="0.5" className="input input-sm" style={{ width: 60 }} 
                                        disabled={!s.enabled}
                                        value={s.resolution_time_hours} 
                                        onChange={e => handleSlaOverrideChange(s.priority_id, 'resolution_time_hours', e.target.value)}
                                    />
                                </td>
                                <td>
                                    <input 
                                        type="number" step="1" className="input input-sm" style={{ width: 60 }} 
                                        disabled={!s.enabled}
                                        value={Math.round((s.first_response_hrs || 0) * 60)} 
                                        onChange={e => handleSlaOverrideChange(s.priority_id, 'response_mins', e.target.value)}
                                    />
                                </td>
                                <td>
                                    {editItem ? (
                                        <button 
                                            type="button" className="btn btn-sm" 
                                            onClick={() => saveSlaOverride(s)}
                                            style={{ padding: '4px 8px', fontSize: 11, background: s.is_overridden ? 'var(--bg-accent-subtle)' : 'transparent', border: '1px solid var(--border)' }}
                                        >
                                            {s.is_overridden ? 'Save' : 'Fixed'}
                                        </button>
                                    ) : (
                                        <span style={{ fontSize: 10, color: 'var(--success)' }}>✓ Ready</span>
                                    )}
                                </td>
                            </tr>
                         ))
                        }
                    </tbody>
                </table>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                {editItem 
                    ? `Changes apply only to ${editItem.name}.`
                    : "These settings will be applied to the new company profile immediately."
                }
            </div>
        </div>
    );

    // Domain management functions
    const openDomainManager = async (customer) => {
        setShowDomainModal(customer)
        setDomainForm({ domain: '', project_id: '' })
        try {
            const r = await api.get(`/projects?customer_id=${customer.id}`)
            setCustomerProjects(r.data.projects)
        } catch { setCustomerProjects([]) }
    }

    const addDomain = async (e) => {
        e.preventDefault()
        if (!domainForm.domain.trim()) return
        setDomainSaving(true)
        try {
            await api.post(`/domains/customer/${showDomainModal.id}`, domainForm)
            toast.success(`Domain '${domainForm.domain}' mapped!`)
            setDomainForm({ domain: '', project_id: '' })
            load() // refresh customer list to show new domains
            // Refresh the customer object in the modal
            const r = await api.get(`/customers/${showDomainModal.id}`)
            setShowDomainModal({ ...r.data.customer, domains: r.data.domains || [] })
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to add domain') }
        setDomainSaving(false)
    }

    const removeDomain = async (domainId) => {
        if (!confirm('Remove this domain mapping?')) return
        try {
            await api.delete(`/domains/${domainId}`)
            toast.success('Domain removed')
            load()
            const r = await api.get(`/customers/${showDomainModal.id}`)
            setShowDomainModal({ ...r.data.customer, domains: r.data.domains || [] })
        } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
    }

    const handleDelete = async (c) => {
        if (!confirm(`Delete customer "${c.name}"? This will also delete all associated domains, projects, and tickets. This action cannot be undone.`)) return
        try {
            await api.delete(`/customers/${c.id}`)
            toast.success('Customer deleted')
            load()
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to delete') }
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
                            <thead><tr><th>Customer</th><th>Code</th><th>Domains</th><th>Email</th><th>Phone</th><th>Projects</th><th>Added</th><th>Actions</th></tr></thead>
                            <tbody>
                                {loading ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: 'auto' }} /></td></tr>
                                    : filtered.length === 0 ? <tr><td colSpan={8} className="empty-row">No customers found</td></tr>
                                        : filtered.map(c => (
                                            <tr key={c.id}>
                                                <td><strong>{c.name}</strong></td>
                                                <td><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)' }}>{c.customer_code || '—'}</span></td>
                                                <td>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                        {(c.domains || []).slice(0, 3).map(d => (
                                                            <span key={d.id} style={{
                                                                background: d.project_id ? 'var(--bg-accent-subtle, rgba(79,142,247,0.12))' : 'var(--bg-success-subtle, rgba(34,197,94,0.12))',
                                                                color: d.project_id ? 'var(--accent)' : 'var(--success, #22c55e)',
                                                                padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500
                                                            }}>
                                                                @{d.domain}
                                                                {d.project_name && <span style={{ opacity: 0.7 }}> → {d.project_name}</span>}
                                                            </span>
                                                        ))}
                                                        {(c.domains || []).length > 3 && (
                                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{c.domains.length - 3} more</span>
                                                        )}
                                                        {(c.domains || []).length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>}
                                                    </div>
                                                </td>
                                                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{c.email || '—'}</td>
                                                <td style={{ fontSize: 13 }}>{c.phone || '—'}</td>
                                                <td><span className="badge badge-in_progress">{c.project_count}</span></td>
                                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(c.created_at).toLocaleDateString('en-IN')}</td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <button className="btn btn-secondary btn-sm" onClick={() => openDomainManager(c)} title="Manage Domains">
                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                                        </button>
                                                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>Edit</button>
                                                        <button className="btn btn-sm" onClick={() => handleDelete(c)} title="Delete Customer"
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

            {/* Create/Edit Customer Modal */}
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
                            <div className="form-group" style={{ marginBottom: 16 }}>
                                <label className="form-label">Company Name <span>*</span></label>
                                <input className="input" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Acme Corp" />
                            </div>
                            <div className="form-grid" style={{ marginBottom: 16 }}>
                                <div className="form-group">
                                    <label className="form-label">Email</label>
                                    <input className="input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="contact@company.com" />
                                    {form.email && form.email.includes('@') && (
                                        <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4 }}>
                                            Domain <strong>@{form.email.split('@')[1]}</strong> will be auto-mapped
                                        </div>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Phone</label>
                                    <input className="input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" />
                                </div>
                            </div>
                            {editItem && projects.length > 0 && (
                                <div className="form-group" style={{ marginBottom: 16 }}>
                                    <label className="form-label">Default Project</label>
                                    <select className="input" value={form.default_project_id} onChange={e => setForm(p => ({ ...p, default_project_id: e.target.value }))}>
                                        <option value="">None (use first available)</option>
                                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                        Tickets from customer-level domains will route to this project
                                    </div>
                                </div>
                            )}

                            {renderSlaOverrides()}

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

            {/* Domain Management Modal */}
            {showDomainModal && (
                <div className="modal-overlay" onClick={() => setShowDomainModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
                        <div className="modal-header">
                            <div>
                                <div className="modal-title">Domain Mappings</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{showDomainModal.name}</div>
                            </div>
                            <button className="modal-close" onClick={() => setShowDomainModal(null)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>

                        {/* Existing domains */}
                        <div style={{ padding: '0 20px', maxHeight: 300, overflowY: 'auto' }}>
                            {(showDomainModal.domains || []).length === 0 ? (
                                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                    No domains mapped yet
                                </div>
                            ) : (
                                <table style={{ width: '100%', fontSize: 13 }}>
                                    <thead><tr><th style={{ textAlign: 'left', padding: '8px 0' }}>Domain</th><th style={{ textAlign: 'left' }}>Routes To</th><th style={{ width: 60 }}>Actions</th></tr></thead>
                                    <tbody>
                                        {(showDomainModal.domains || []).map(d => (
                                            <tr key={d.id}>
                                                <td style={{ padding: '8px 0' }}>
                                                    <span style={{
                                                        background: d.project_id ? 'var(--bg-accent-subtle, rgba(79,142,247,0.12))' : 'var(--bg-success-subtle, rgba(34,197,94,0.12))',
                                                        color: d.project_id ? 'var(--accent)' : 'var(--success, #22c55e)',
                                                        padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600
                                                    }}>
                                                        @{d.domain}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: 12 }}>
                                                    {d.project_name
                                                        ? <span>Project: <strong>{d.project_name}</strong></span>
                                                        : <span style={{ color: 'var(--text-muted)' }}>Customer Root</span>
                                                    }
                                                </td>
                                                <td>
                                                    <button className="btn btn-sm" onClick={() => removeDomain(d.id)}
                                                        style={{ color: 'var(--danger, #ef4444)', background: 'transparent', padding: '4px 8px', fontSize: 11 }}>
                                                        Remove
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Add domain form */}
                        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>Add Domain Mapping</div>
                            <form onSubmit={addDomain} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                                <div style={{ flex: 1 }}>
                                    <input className="input" style={{ fontSize: 13 }} required value={domainForm.domain}
                                        onChange={e => setDomainForm(p => ({ ...p, domain: e.target.value }))}
                                        placeholder="e.g. shams.multycomm.com" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <select className="input" style={{ fontSize: 13 }} value={domainForm.project_id}
                                        onChange={e => setDomainForm(p => ({ ...p, project_id: e.target.value }))}>
                                        <option value="">Customer Root</option>
                                        {customerProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                                <button className="btn btn-primary btn-sm" type="submit" disabled={domainSaving} style={{ whiteSpace: 'nowrap' }}>
                                    {domainSaving ? '...' : '+ Add'}
                                </button>
                            </form>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                                "Customer Root" = emails go to this customer's default project. Select a project for project-level routing.
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
