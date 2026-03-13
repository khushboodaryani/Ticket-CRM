// src/pages/WorkflowBuilder.jsx
import { useState, useEffect } from 'react'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import toast from 'react-hot-toast'

const TRIGGERS = [
    { value: 'ticket_created',  label: 'Ticket is Created' },
    { value: 'ticket_updated',  label: 'Ticket is Updated' },
    { value: 'status_changed',  label: 'Status Changes' },
    { value: 'sla_breached',    label: 'SLA is Breached' },
]

const CONDITION_FIELDS = [
    { value: '',         label: '— No condition (always run) —' },
    { value: 'priority', label: 'Priority' },
    { value: 'category', label: 'Category' },
    { value: 'source',   label: 'Source' },
]

const CONDITION_VALUES = {
    priority: ['P1', 'P2', 'P3', 'P4', 'P5'],
    category: ['Inquiry', 'Complaint', 'Technical', 'Billing', 'Other'],
    source:   ['manual', 'email', 'call', 'chat', 'csv'],
}

const ACTION_TYPES = [
    { value: 'update_status',    label: 'Change Status To' },
    { value: 'assign_to',        label: 'Assign Ticket To User' },
    { value: 'add_internal_note',label: 'Add Internal Note' },
]

const STATUS_VALUES = ['open', 'in_progress', 'pending', 'resolved', 'closed']

const emptyCondition = { field: '', value: '' }
const emptyAction    = { type: 'update_status', value: 'in_progress' }
const emptyForm      = { name: '', trigger_event: 'ticket_created', condition: emptyCondition, action: emptyAction }

export default function WorkflowBuilder() {
    const [rules, setRules]         = useState([])
    const [users, setUsers]         = useState([])
    const [loading, setLoading]     = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editRule, setEditRule]   = useState(null)
    const [form, setForm]           = useState(emptyForm)
    const [saving, setSaving]       = useState(false)

    const load = () => {
        setLoading(true)
        Promise.all([
            api.get('/workflows/rules'),
            api.get('/users'),
        ]).then(([r, u]) => {
            setRules(r.data.rules || [])
            setUsers(u.data.users || [])
        }).catch(() => toast.error('Failed to load data'))
          .finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    // Build condition/action objects from flat form state
    const buildPayload = () => ({
        name:          form.name,
        trigger_event: form.trigger_event,
        conditions:    form.condition.field
            ? JSON.stringify({ [form.condition.field]: form.condition.value })
            : JSON.stringify({}),
        actions: JSON.stringify([{ type: form.action.type, value: form.action.value }]),
    })

    // Parse saved rule back into flat form state for editing
    const parseRule = (rule) => {
        let cond = emptyCondition
        let act  = emptyAction
        try {
            const c = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions
            const keys = Object.keys(c || {})
            if (keys.length) cond = { field: keys[0], value: c[keys[0]] }
        } catch { /* */ }
        try {
            const a = typeof rule.actions === 'string' ? JSON.parse(rule.actions) : rule.actions
            const arr = Array.isArray(a) ? a : [a]
            if (arr.length) act = { type: arr[0].type || 'update_status', value: String(arr[0].value || '') }
        } catch { /* */ }
        return {
            name: rule.name,
            trigger_event: rule.trigger_event,
            condition: cond,
            action: act,
        }
    }

    const openCreate = () => { setEditRule(null); setForm(emptyForm); setShowModal(true) }
    const openEdit   = (rule) => { setEditRule(rule); setForm(parseRule(rule)); setShowModal(true) }

    const handleSave = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            const payload = buildPayload()
            if (editRule) {
                await api.put(`/workflows/rules/${editRule.id}`, payload)
                toast.success('Workflow updated!')
            } else {
                await api.post('/workflows/rules', payload)
                toast.success('Workflow created!')
            }
            setShowModal(false)
            load()
        } catch (err) {
            toast.error(err.response?.data?.message || 'Save failed')
        } finally { setSaving(false) }
    }

    const handleToggle = async (rule) => {
        try {
            await api.patch(`/workflows/rules/${rule.id}/toggle`)
            toast.success(`Workflow ${rule.is_active ? 'deactivated' : 'activated'}`)
            load()
        } catch { toast.error('Failed to toggle') }
    }

    const handleDelete = async (id) => {
        if (!confirm('Delete this workflow rule?')) return
        try {
            await api.delete(`/workflows/rules/${id}`)
            toast.success('Workflow deleted')
            load()
        } catch { toast.error('Failed to delete') }
    }

    // Human-readable summary of a rule's condition/action
    const summariseCondition = (rule) => {
        try {
            const c = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions
            const keys = Object.keys(c || {})
            if (!keys.length) return 'Always'
            return `${keys[0]} = ${c[keys[0]]}`
        } catch { return '—' }
    }

    const summariseAction = (rule) => {
        try {
            const a = typeof rule.actions === 'string' ? JSON.parse(rule.actions) : rule.actions
            const arr = Array.isArray(a) ? a : [a]
            if (!arr.length) return '—'
            const { type, value } = arr[0]
            if (type === 'assign_to') {
                const u = users.find(u => String(u.id) === String(value))
                return `Assign → ${u ? u.name : `User #${value}`}`
            }
            if (type === 'update_status') return `Set status → ${value}`
            if (type === 'add_internal_note') return `Add note: "${value}"`
            return `${type}: ${value}`
        } catch { return '—' }
    }

    const activeCount = rules.filter(r => r.is_active).length

    // Which values to show for the action based on type
    const actionValueField = () => {
        switch (form.action.type) {
            case 'update_status':
                return (
                    <select className="input" value={form.action.value} onChange={e => setForm(p => ({ ...p, action: { ...p.action, value: e.target.value } }))}>
                        {STATUS_VALUES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                )
            case 'assign_to':
                return (
                    <select className="input" value={form.action.value} onChange={e => setForm(p => ({ ...p, action: { ...p.action, value: e.target.value } }))}>
                        <option value="">— Pick a user —</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                    </select>
                )
            case 'add_internal_note':
                return (
                    <input className="input" placeholder="Note text…" value={form.action.value} onChange={e => setForm(p => ({ ...p, action: { ...p.action, value: e.target.value } }))} />
                )
            default:
                return null
        }
    }

    return (
        <>
            <Topbar
                title="Workflow Builder"
                subtitle={`${rules.length} rule${rules.length !== 1 ? 's' : ''} · ${activeCount} active`}
                actions={<button className="btn btn-primary btn-sm" onClick={openCreate}>+ New Rule</button>}
            />

            <div className="page-body">
                {loading ? (
                    <div className="loader-center"><div className="spinner spinner-lg" /></div>
                ) : rules.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                        </div>
                        <div>No workflow rules yet</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Automate ticket routing and SLA escalations</div>
                        <div style={{ marginTop: 14 }}>
                            <button className="btn btn-primary btn-sm" onClick={openCreate}>Create your first rule</button>
                        </div>
                    </div>
                ) : (
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Rule Name</th>
                                    <th>Trigger</th>
                                    <th>Condition</th>
                                    <th>Action</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rules.map(rule => (
                                    <tr key={rule.id}>
                                        <td>
                                            <div style={{ fontWeight: 600, fontSize: 13 }}>{rule.name}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                                ID #{rule.id} · {new Date(rule.created_at).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="badge badge-in_progress">
                                                {TRIGGERS.find(t => t.value === rule.trigger_event)?.label || rule.trigger_event}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                            {summariseCondition(rule)}
                                        </td>
                                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                            {summariseAction(rule)}
                                        </td>
                                        <td>
                                            <button
                                                onClick={() => handleToggle(rule)}
                                                className={`badge ${rule.is_active ? 'badge-resolved' : 'badge-closed'}`}
                                                style={{ cursor: 'pointer', border: 'none', background: 'none' }}
                                                title="Click to toggle on/off"
                                            >
                                                {rule.is_active ? '● Active' : '○ Inactive'}
                                            </button>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(rule)}>
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                                    Edit
                                                </button>
                                                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(rule.id)}>
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create / Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-title">{editRule ? 'Edit Workflow Rule' : 'Create Workflow Rule'}</div>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>

                        <form onSubmit={handleSave}>
                            {/* Row 1: Name + Trigger */}
                            <div className="form-grid" style={{ marginBottom: 20 }}>
                                <div className="form-group">
                                    <label className="form-label">Rule Name <span>*</span></label>
                                    <input
                                        className="input"
                                        required
                                        value={form.name}
                                        onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                                        placeholder="e.g., Auto-assign P1 to GM"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">When does this run?</label>
                                    <select className="input" value={form.trigger_event} onChange={e => setForm(p => ({ ...p, trigger_event: e.target.value }))}>
                                        {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Condition Section */}
                            <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: 16, marginBottom: 16, border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                                    IF Condition
                                </div>
                                <div className="form-grid">
                                    <div className="form-group">
                                        <label className="form-label">Ticket field</label>
                                        <select
                                            className="input"
                                            value={form.condition.field}
                                            onChange={e => setForm(p => ({ ...p, condition: { field: e.target.value, value: '' } }))}
                                        >
                                            {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Equals</label>
                                        {form.condition.field ? (
                                            <select className="input" value={form.condition.value} onChange={e => setForm(p => ({ ...p, condition: { ...p.condition, value: e.target.value } }))}>
                                                <option value="">— Select value —</option>
                                                {(CONDITION_VALUES[form.condition.field] || []).map(v => <option key={v} value={v}>{v}</option>)}
                                            </select>
                                        ) : (
                                            <input className="input" disabled placeholder="Select a field first" />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Action Section */}
                            <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: 16, marginBottom: 24, border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                                    THEN Action
                                </div>
                                <div className="form-grid">
                                    <div className="form-group">
                                        <label className="form-label">Action type</label>
                                        <select className="input" value={form.action.type} onChange={e => setForm(p => ({ ...p, action: { type: e.target.value, value: '' } }))}>
                                            {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Value</label>
                                        {actionValueField()}
                                    </div>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Saving…' : (editRule ? 'Update Rule' : 'Create Rule')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
