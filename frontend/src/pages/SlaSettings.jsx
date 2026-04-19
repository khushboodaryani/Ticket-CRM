import { useEffect, useState, Fragment } from 'react'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import BusinessHoursPanel from '../components/Shared/BusinessHoursPanel'
import { toast } from 'react-hot-toast'

const PRIORITY_COLORS = {
    P1: '#ef4444', P2: '#f97316', P3: '#f59e0b', P4: '#22c55e', P5: '#6b7280',
    P6: '#8b5cf6', P7: '#06b6d4', P8: '#ec4899', P9: '#14b8a6', P10: '#a855f7'
}

const getPriorityColor = (p, priorities = []) => {
    const found = priorities.find(x => x.name === p)
    return found?.color_code || '#64748b'
}

// Format seconds to a human-readable label
const formatResponseTime = (hrs) => {
    if (!hrs || hrs <= 0) return '—'
    if (hrs < 1) return `${Math.round(hrs * 60)}m`
    return `${hrs.toFixed(1).replace(/\.0$/, '')}h`
}

export default function SlaSettings() {
    const [activeTab, setActiveTab] = useState('policies') // 'policies' | 'business_hours'
    const [policies, setPolicies] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(null)
    const [showAddForm, setShowAddForm] = useState(false)
    const [priorities, setPriorities] = useState([])
    const [categories, setCategories] = useState([])
    const [newPriority, setNewPriority] = useState({
        priority: '',
        category_id: '',
        level: 1,
        resolution_time_hours: 4,
        first_response_hrs: 1.0,
        escalation_1_min: 60,
        escalation_2_min: 120,
        escalation_3_min: 180
    })

    // Auto-suggest next level and name when category changes
    useEffect(() => {
        if (!newPriority.category_id || categories.length === 0) return;
        
        const cat = categories.find(c => c.id === parseInt(newPriority.category_id));
        if (!cat) return;

        // Find max level for this category in existing policies
        const catPolicies = policies.filter(p => p.category_name === cat.name);
        const maxLevel = catPolicies.reduce((max, p) => Math.max(max, p.level || 0), 0);
        const nextLevel = maxLevel + 1;

        setNewPriority(prev => ({
            ...prev,
            level: nextLevel,
            priority: `${cat.prefix}${nextLevel}`
        }));
    }, [newPriority.category_id, categories, policies]);

    // Initialize category_id once categories are loaded
    useEffect(() => {
        if (categories.length > 0 && !newPriority.category_id) {
            setNewPriority(prev => ({ ...prev, category_id: categories[0].id }));
        }
    }, [categories]);

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        try {
            const [slaRes, prioRes, catRes] = await Promise.all([
                api.get('/sla'),
                api.get('/sla/priorities'),
                api.get('/sla/categories')
            ])
            setPolicies(slaRes.data.policies || [])
            setPriorities(prioRes.data.priorities || [])
            setCategories(catRes.data.categories || [])
        } catch (err) {
            toast.error("Failed to load SLA data")
        } finally {
            setLoading(false)
        }
    }

    const handleChange = (id, field, value) => {
        setPolicies(prev => prev.map(p => {
            if (p.id !== id) return p
            return { ...p, [field]: parseFloat(value) || 0 }
        }))
    }

    const handleSave = async (policy) => {
        setSaving(policy.priority)
        try {
            const payload = {
                resolution_time_hours: policy.resolution_time_hours,
                first_response_hrs: policy.first_response_hrs,
                escalation_1_min: policy.escalation_1_min,
                escalation_2_min: policy.escalation_2_min,
                escalation_3_min: policy.escalation_3_min
            }

            await api.put(`/sla/${policy.id}`, payload)
            toast.success(`${policy.priority} SLA updated`)
            await fetchData()
        } catch (err) {
            toast.error(`Failed to update ${policy.priority}`)
        } finally {
            setSaving(null)
        }
    }

    const handleAddPriority = async () => {
        if (!newPriority.priority.trim()) {
            return toast.error('Priority name is required')
        }

        setSaving('__new__')
        try {
            await api.post('/sla', {
                priority: newPriority.priority.trim(),
                category_id: parseInt(newPriority.category_id, 10),
                level: parseInt(newPriority.level, 10) || 1,
                resolution_time_hours: parseFloat(newPriority.resolution_time_hours) || 4,
                first_response_hrs: parseFloat(newPriority.first_response_hrs) || 1.0,
                escalation_1_min: parseInt(newPriority.escalation_1_min, 10) || 60,
                escalation_2_min: parseInt(newPriority.escalation_2_min, 10) || 120,
                escalation_3_min: parseInt(newPriority.escalation_3_min, 10) || 180
            })
            toast.success(`Priority ${newPriority.priority} created!`)
            setShowAddForm(false)
            setNewPriority({
                priority: '', category_id: 1, level: 1,
                resolution_time_hours: 4, first_response_hrs: 1.0,
                escalation_1_min: 60, escalation_2_min: 120, escalation_3_min: 180
            })
            await fetchData()
        } catch (err) {
            toast.error(err.response?.data?.message || `Failed to create priority`)
        } finally {
            setSaving(null)
        }
    }

    const handleDelete = async (policy) => {
        if (!window.confirm(`Delete priority ${policy.priority}? This cannot be undone.`)) return
        setSaving(policy.priority)
        try {
            await api.delete(`/sla/${policy.id}`)
            toast.success(`${policy.priority} deleted`)
            await fetchData()
        } catch (err) {
            toast.error(err.response?.data?.message || `Failed to delete ${policy.priority}`)
        } finally {
            setSaving(null)
        }
    }

    return (
        <>
            <Topbar title="SLA Settings" subtitle="Configure automated resolution deadlines, response targets, and escalation triggers." />
            
            <div className="page-body">
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
                    <button 
                        onClick={() => setActiveTab('policies')}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            padding: '0 4px 12px 4px',
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 600,
                            color: activeTab === 'policies' ? 'var(--primary)' : 'var(--text)',
                            borderBottom: activeTab === 'policies' ? '2px solid var(--primary)' : '2px solid transparent'
                        }}
                    >
                        SLA Policies
                    </button>
                    <button 
                        onClick={() => setActiveTab('business_hours')}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            padding: '0 4px 12px 4px',
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 600,
                            color: activeTab === 'business_hours' ? 'var(--primary)' : 'var(--text)',
                            borderBottom: activeTab === 'business_hours' ? '2px solid var(--primary)' : '2px solid transparent'
                        }}
                    >
                        Business Hours
                    </button>
                </div>

                {activeTab === 'policies' && (
                    <div className="card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="card-title">SLA Policies by Priority</div>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                                setShowAddForm(!showAddForm);
                                // Force a recalculation when opening
                                if (!showAddForm && categories.length > 0) {
                                     const cat = categories.find(c => c.id === parseInt(newPriority.category_id || categories[0].id));
                                     if (cat) {
                                         const catPolicies = policies.filter(p => p.category_name === cat.name);
                                         const maxLevel = catPolicies.reduce((max, p) => Math.max(max, p.level || 0), 0);
                                         const nextLevel = maxLevel + 1;
                                         setNewPriority(prev => ({ ...prev, level: nextLevel, priority: `${cat.prefix}${nextLevel}` }));
                                     }
                                }
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            Add Priority
                        </button>
                    </div>

                    {/* Add New Priority Form */}
                    {showAddForm && (
                        <div style={{
                            padding: '16px 20px', borderBottom: '1px solid var(--border)',
                            background: 'var(--bg-input)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end'
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label className="form-label" style={{ fontSize: 11 }}>Priority Label</label>
                                <input
                                    className="input input-sm"
                                    placeholder="e.g. P2"
                                    value={newPriority.priority}
                                    onChange={e => setNewPriority(p => ({ ...p, priority: e.target.value }))}
                                    style={{ width: 80, borderRadius: 8 }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label className="form-label" style={{ fontSize: 11 }}>Category</label>
                                <select 
                                    className="input input-sm"
                                    value={newPriority.category_id}
                                    onChange={e => setNewPriority(p => ({ ...p, category_id: e.target.value }))}
                                    style={{ width: 110, borderRadius: 8 }}
                                >
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.prefix})</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label className="form-label" style={{ fontSize: 11 }}>Level</label>
                                <input
                                    type="number" className="input input-sm"
                                    value={newPriority.level} min={1} max={10}
                                    onChange={e => setNewPriority(p => ({ ...p, level: e.target.value }))}
                                    style={{ width: 60, borderRadius: 8 }}
                                    placeholder="1=Highest"
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label className="form-label" style={{ fontSize: 11 }}>Resolution (Hrs)</label>
                                <input
                                    type="number" className="input input-sm"
                                    value={newPriority.resolution_time_hours} step={0.5} min={0.25}
                                    onChange={e => setNewPriority(p => ({ ...p, resolution_time_hours: e.target.value }))}
                                    style={{ width: 90, borderRadius: 8 }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label className="form-label" style={{ fontSize: 11 }}>Response (Min)</label>
                                <input
                                    type="number" className="input input-sm"
                                    value={Math.round(newPriority.first_response_hrs * 60)} step={1} min={1}
                                    onChange={e => setNewPriority(p => ({ ...p, first_response_hrs: (parseFloat(e.target.value) || 0) / 60 }))}
                                    style={{ width: 80, borderRadius: 8 }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label className="form-label" style={{ fontSize: 11 }}>L1 (Min)</label>
                                <input
                                    type="number" className="input input-sm"
                                    value={newPriority.escalation_1_min || ''} min={1}
                                    onChange={e => setNewPriority(p => ({ ...p, escalation_1_min: e.target.value }))}
                                    style={{ width: 80, borderRadius: 8 }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label className="form-label" style={{ fontSize: 11 }}>L2 (Min)</label>
                                <input
                                    type="number" className="input input-sm"
                                    value={newPriority.escalation_2_min || ''} min={1}
                                    onChange={e => setNewPriority(p => ({ ...p, escalation_2_min: e.target.value }))}
                                    style={{ width: 80, borderRadius: 8 }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <label className="form-label" style={{ fontSize: 11 }}>L3 (Min)</label>
                                <input
                                    type="number" className="input input-sm"
                                    value={newPriority.escalation_3_min || ''} min={1}
                                    onChange={e => setNewPriority(p => ({ ...p, escalation_3_min: e.target.value }))}
                                    style={{ width: 80, borderRadius: 8 }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 2 }}>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={handleAddPriority}
                                    disabled={saving === '__new__'}
                                    style={{ padding: '6px 14px' }}
                                >
                                    {saving === '__new__' ? <div className="spinner spinner-sm" /> : 'Create'}
                                </button>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setShowAddForm(false)}
                                    style={{ padding: '6px 14px' }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                    
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Priority</th>
                                    <th>Resolution (Hrs)</th>
                                    <th>Response (Min)</th>
                                    <th>L1 (m)</th>
                                    <th>L2 (m)</th>
                                    <th>L3 (m)</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: 'auto' }} /></td></tr>
                                ) : policies.length === 0 ? (
                                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No policies found.</td></tr>
                                ) : (
                                    // Group and render by category
                                    categories.map(cat => {
                                        const catPolicies = policies.filter(p => p.category_name === cat.name);
                                        if (catPolicies.length === 0) return null;

                                        return (
                                            <Fragment key={cat.id}>
                                                <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                                                    <td colSpan={7} style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                        {cat.name} Category ({cat.prefix} Series)
                                                    </td>
                                                </tr>
                                                {catPolicies.map(p => (
                                                    <tr key={p.id}>
                                                        <td style={{ paddingLeft: 32 }}>
                                                            <span style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                                                padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                                                                background: `${getPriorityColor(p.priority, priorities)}20`,
                                                                color: getPriorityColor(p.priority, priorities),
                                                                border: `1px solid ${getPriorityColor(p.priority, priorities)}40`
                                                            }}>
                                                                <span style={{
                                                                    width: 7, height: 7, borderRadius: '50%',
                                                                    background: getPriorityColor(p.priority, priorities)
                                                                }} />
                                                                {p.priority}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <input 
                                                                type="number" 
                                                                className="input input-sm" 
                                                                value={p.resolution_time_hours} 
                                                                step={0.5} 
                                                                min={0.25}
                                                                onChange={e => handleChange(p.id, 'resolution_time_hours', e.target.value)}
                                                                style={{ width: 100, borderRadius: 8 }}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                className="input input-sm"
                                                                value={Math.round(p.first_response_hrs * 60)}
                                                                step={1}
                                                                min={1}
                                                                onChange={e => handleChange(p.id, 'first_response_hrs', (parseFloat(e.target.value) || 0) / 60)}
                                                                style={{ width: 80, borderRadius: 8 }}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                className="input input-sm"
                                                                value={p.escalation_1_min || 60}
                                                                min={1}
                                                                onChange={e => handleChange(p.id, 'escalation_1_min', e.target.value)}
                                                                style={{ width: 80, borderRadius: 8 }}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                className="input input-sm"
                                                                value={p.escalation_2_min || 120}
                                                                min={1}
                                                                onChange={e => handleChange(p.id, 'escalation_2_min', e.target.value)}
                                                                style={{ width: 80, borderRadius: 8 }}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                className="input input-sm"
                                                                value={p.escalation_3_min || 180}
                                                                min={1}
                                                                onChange={e => handleChange(p.id, 'escalation_3_min', e.target.value)}
                                                                style={{ width: 80, borderRadius: 8 }}
                                                            />
                                                        </td>
                                                        <td>
                                                            <div style={{ display: 'flex', gap: 8 }}>
                                                                <button 
                                                                    className="btn btn-primary btn-sm" 
                                                                    disabled={saving === p.priority}
                                                                    onClick={() => handleSave(p)}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px' }}
                                                                >
                                                                    {saving === p.priority ? (
                                                                        <div className="spinner spinner-sm" />
                                                                    ) : (
                                                                        <>
                                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                                                                            Save
                                                                        </>
                                                                    )}
                                                                </button>
                                                                <button
                                                                    className="btn btn-sm"
                                                                    style={{
                                                                        padding: '6px 10px',
                                                                        background: 'transparent',
                                                                        border: '1px solid var(--border)',
                                                                        color: '#ef4444',
                                                                        cursor: 'pointer',
                                                                        borderRadius: 8,
                                                                        display: 'flex', alignItems: 'center'
                                                                    }}
                                                                    disabled={saving === p.priority}
                                                                    onClick={() => handleDelete(p)}
                                                                    title={`Delete ${p.priority}`}
                                                                >
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Info footer */}
                    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                        </svg>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            Priorities are dynamically configured. Response time can be set in seconds or minutes. 
                            Priorities with active tickets cannot be deleted.
                        </span>
                    </div>
                </div>
                )}
                
                {activeTab === 'business_hours' && (
                    <BusinessHoursPanel />
                )}
            </div>
        </>
    )
}
