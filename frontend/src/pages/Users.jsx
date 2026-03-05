// src/pages/Users.jsx
import { useEffect, useState } from 'react'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const ROLES = ['superadmin', 'gm', 'manager', 'tl', 'agent']

function RoleBadge({ r }) { return <span className={`role-badge role-${r}`}>{r}</span> }

export default function Users() {
    const { user: currentUser } = useAuth()
    const isSuperAdmin = currentUser?.role === 'superadmin'
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editUser, setEditUser] = useState(null)
    const [form, setForm] = useState({ name: '', email: '', password: '', role: 'agent', reporting_to: '' })
    const [saving, setSaving] = useState(false)
    const [search, setSearch] = useState('')
    const [filterRole, setFilterRole] = useState('')

    const load = () => {
        setLoading(true)
        api.get('/users', { params: filterRole ? { role: filterRole } : {} }).then(r => setUsers(r.data.users)).finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [filterRole])

    const openCreate = () => { setEditUser(null); setForm({ name: '', email: '', password: '', role: 'agent', reporting_to: '' }); setShowModal(true) }
    const openEdit = (u) => { setEditUser(u); setForm({ name: u.name, email: u.email, password: '', role: u.role, reporting_to: u.reporting_to_id || '' }); setShowModal(true) }

    const handleSave = async (e) => {
        e.preventDefault(); setSaving(true)
        try {
            if (editUser) {
                await api.put(`/users/${editUser.id}`, form)
                toast.success('User updated!')
            } else {
                await api.post('/users', form)
                toast.success('User created!')
            }
            setShowModal(false); load()
        } catch (err) { toast.error(err.response?.data?.message || 'Failed') }
        setSaving(false)
    }

    const filtered = users.filter(u => !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))

    const managerUsers = users.filter(u => ['superadmin', 'gm', 'manager', 'tl'].includes(u.role))

    return (
        <>
            <Topbar title="Users" subtitle={`${users.length} total users`}
                actions={isSuperAdmin && <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Add User</button>} />
            <div className="page-body">
                <div className="card">
                    <div className="filters-bar">
                        <div className="search-box">
                            <span className="search-icon">🔍</span>
                            <input className="search-input" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <select className="filter-select" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
                            <option value="">All Roles</option>
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div className="table-wrap">
                        <table>
                            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Reports To</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
                            <tbody>
                                {loading ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: 'auto' }} /></td></tr>
                                    : filtered.length === 0 ? <tr><td colSpan={7} className="empty-row">No users found</td></tr>
                                        : filtered.map(u => (
                                            <tr key={u.id}>
                                                <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div className="user-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{u.name?.slice(0, 2).toUpperCase()}</div>
                                                    <strong>{u.name}</strong>
                                                </div></td>
                                                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{u.email}</td>
                                                <td><RoleBadge r={u.role} /></td>
                                                <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{u.reporting_to_name || '—'}</td>
                                                <td>{u.is_active ? <span className="badge badge-resolved">Active</span> : <span className="badge badge-closed">Inactive</span>}</td>
                                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                                                <td><button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>Edit</button></td>
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
                            <div className="modal-title">{editUser ? 'Edit User' : 'Add New User'}</div>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="form-grid" style={{ marginBottom: 16 }}>
                                <div className="form-group">
                                    <label className="form-label">Full Name <span>*</span></label>
                                    <input className="input" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="John Doe" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Email <span>*</span></label>
                                    <input className="input" type="email" required value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="john@company.com" />
                                </div>
                            </div>
                            <div className="form-grid" style={{ marginBottom: 16 }}>
                                <div className="form-group">
                                    <label className="form-label">Password {editUser && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(leave blank to keep)</span>}</label>
                                    <input className="input" type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="••••••••" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Role <span>*</span></label>
                                    {isSuperAdmin ? (
                                        <select className="input" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8 }}>
                                            <RoleBadge r={form.role} />
                                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Only superadmin can change roles</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: 20 }}>
                                <label className="form-label">Reports To</label>
                                <select className="input" value={form.reporting_to} onChange={e => setForm(p => ({ ...p, reporting_to: e.target.value }))}>
                                    <option value="">— None —</option>
                                    {managerUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                                </select>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" type="button" onClick={() => setShowModal(false)}>Cancel</button>
                                <button className="btn btn-primary" type="submit" disabled={saving}>
                                    {saving ? 'Saving…' : editUser ? 'Update User' : 'Create User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
