import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'

const EMPTY_TEMPLATE = {
    template_key: '',
    name: '',
    description: '',
    subject_template: '',
    heading: '',
    body_text: '',
    footer_text: '',
    body_html: '',
    is_active: 1,
    uses_default: true,
}

export default function NotificationTemplates() {
    const [templates, setTemplates] = useState([])
    const [variables, setVariables] = useState([])
    const [activeKey, setActiveKey] = useState('')
    const [draft, setDraft] = useState(EMPTY_TEMPLATE)
    const [preview, setPreview] = useState({ subject: '', html: '' })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [previewing, setPreviewing] = useState(false)
    const [editMode] = useState('simple')

    useEffect(() => {
        fetchTemplates()
    }, [])

    useEffect(() => {
        const selected = templates.find(template => template.template_key === activeKey)
        if (selected) {
            setDraft(selected)
            runPreview(selected)
        }
    }, [activeKey, templates])

    const fetchTemplates = async () => {
        setLoading(true)
        try {
            const { data } = await api.get('/notifications/templates')
            const list = data.templates || []
            setTemplates(list)
            setVariables(data.variables || [])
            if (!activeKey && list.length > 0) {
                setActiveKey(list[0].template_key)
            }
        } catch (err) {
            toast.error('Failed to load notification templates', { id: 'notification-template-load' })
        } finally {
            setLoading(false)
        }
    }

    const runPreview = async (template = draft) => {
        if (!template?.template_key) return
        setPreviewing(true)
        try {
            const { data } = await api.post(`/notifications/templates/${template.template_key}/preview`, {
                subject_template: template.subject_template,
                heading: template.heading,
                body_text: template.body_text,
                footer_text: template.footer_text,
                body_html: template.body_html,
            })
            setPreview(data.preview || { subject: '', html: '' })
        } catch (err) {
            toast.error('Preview failed', { id: 'notification-template-preview' })
        } finally {
            setPreviewing(false)
        }
    }

    const handleSave = async () => {
        if (!draft.template_key) return
        setSaving(true)
        try {
            await api.put(`/notifications/templates/${draft.template_key}`, {
                subject_template: draft.subject_template,
                heading: draft.heading,
                body_text: draft.body_text,
                footer_text: draft.footer_text,
                body_html: draft.body_html,
                is_active: draft.is_active,
            })
            toast.success('Template saved', { id: 'notification-template-save' })
            await fetchTemplates()
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save template', { id: 'notification-template-save' })
        } finally {
            setSaving(false)
        }
    }

    const handleReset = async () => {
        if (!draft.template_key) return
        if (!window.confirm('Reset this template to the default design?')) return

        setSaving(true)
        try {
            await api.delete(`/notifications/templates/${draft.template_key}`)
            toast.success('Template reset to default', { id: 'notification-template-reset' })
            await fetchTemplates()
        } catch (err) {
            toast.error('Failed to reset template', { id: 'notification-template-reset' })
        } finally {
            setSaving(false)
        }
    }

    const insertVariable = (variableKey) => {
        const placeholder = `{{${variableKey}}}`
        if (editMode === 'simple') {
            setDraft(prev => ({ ...prev, body_text: `${prev.body_text}${placeholder}` }))
        } else {
            setDraft(prev => ({ ...prev, body_html: `${prev.body_html}${placeholder}` }))
        }
    }

    return (
        <>
            <Topbar
                title="Email Templates"
                subtitle="Edit customer-facing acknowledgement, assignment, and SLA breach emails while keeping safe defaults available."
            />

            <div className="page-body">
                {loading ? (
                    <div className="card notification-template-loading" style={{ padding: 24 }}>Loading templates...</div>
                ) : (
                    <div className="notification-template-grid">
                        <div className="card notification-template-library-card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div className="card-header">
                                <div className="card-title">Template Library</div>
                            </div>
                            <div className="notification-template-library-list">
                                {templates.length === 0 ? (
                                    <div className="notification-template-empty">
                                        No templates found yet. Default templates will appear here automatically.
                                    </div>
                                ) : templates.map(template => (
                                    <button
                                        key={template.template_key}
                                        onClick={() => setActiveKey(template.template_key)}
                                        className={`notification-template-library-item ${activeKey === template.template_key ? 'active' : ''}`}
                                    >
                                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{template.name}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{template.description}</div>
                                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                                            <span className="notification-template-chip notification-template-chip-info">
                                                {template.uses_default ? 'Default' : 'Custom'}
                                            </span>
                                            <span className={`notification-template-chip ${template.is_active ? 'notification-template-chip-neutral' : 'notification-template-chip-danger'}`}>
                                                {template.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="notification-template-main">
                            <div className="card notification-template-editor-card">
                                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                    <div>
                                        <div className="card-title">{draft.name || 'Template Editor'}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{draft.description}</div>
                                    </div>
                                    <label className="notification-template-toggle">
                                        <input
                                            type="checkbox"
                                            checked={!!draft.is_active}
                                            onChange={e => setDraft(prev => ({ ...prev, is_active: e.target.checked ? 1 : 0 }))}
                                        />
                                        Active
                                    </label>
                                </div>

                                <div style={{ display: 'grid', gap: 16 }}>
                                    <div>
                                        <label className="form-label">Subject Template</label>
                                        <input
                                            className="input"
                                            value={draft.subject_template}
                                            onChange={e => setDraft(prev => ({ ...prev, subject_template: e.target.value }))}
                                            placeholder="Re: [{{ticket_number}}] {{ticket_subject}}"
                                        />
                                    </div>

                                    {editMode === 'simple' ? (
                                        <>
                                            <div>
                                                <label className="form-label">Email Heading</label>
                                                <input
                                                    className="input"
                                                    value={draft.heading || ''}
                                                    onChange={e => setDraft(prev => ({ ...prev, heading: e.target.value }))}
                                                    placeholder="e.g. Ticket Acknowledgement"
                                                />
                                            </div>
                                            <div>
                                                <label className="form-label">Main Message Content</label>
                                                <textarea
                                                    className="input"
                                                    value={draft.body_text || ''}
                                                    onChange={e => setDraft(prev => ({ ...prev, body_text: e.target.value }))}
                                                    rows={8}
                                                    placeholder="Type your message here. Use variables like {{ticket_number}}"
                                                />
                                            </div>
                                            <div>
                                                <label className="form-label">Footer Signature</label>
                                                <input
                                                    className="input"
                                                    value={draft.footer_text || ''}
                                                    onChange={e => setDraft(prev => ({ ...prev, footer_text: e.target.value }))}
                                                    placeholder="e.g. Regards, Team Multycomm"
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <div>
                                            <label className="form-label">Body HTML (Advanced)</label>
                                            <textarea
                                                className="input"
                                                value={draft.body_html}
                                                onChange={e => setDraft(prev => ({ ...prev, body_html: e.target.value }))}
                                                rows={18}
                                                style={{ resize: 'vertical', fontFamily: 'Consolas, monospace', lineHeight: 1.55 }}
                                            />
                                        </div>
                                    )}

                                    <div>
                                        <div className="form-label" style={{ marginBottom: 8 }}>Available Variables</div>
                                        <div className="notification-template-chip-row">
                                            {variables.map(variable => (
                                                <button
                                                    key={variable.key}
                                                    type="button"
                                                    onClick={() => insertVariable(variable.key)}
                                                    className="notification-template-variable"
                                                    title={variable.label}
                                                >
                                                    {`{{${variable.key}}}`}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                            {saving ? 'Saving...' : 'Save Template'}
                                        </button>
                                        <button className="btn btn-secondary" onClick={() => runPreview()} disabled={previewing}>
                                            {previewing ? 'Refreshing Preview...' : 'Refresh Preview'}
                                        </button>
                                        <button className="btn btn-secondary" onClick={handleReset} disabled={saving}>
                                            Reset to Default
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="card notification-template-preview-card">
                                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div className="card-title">Live Preview</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Preview uses sample ticket data</div>
                                </div>

                                <div className="notification-template-preview-shell">
                                    <div className="notification-template-preview-subject">
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Subject</div>
                                        <div style={{ fontSize: 14, color: 'var(--text-primary)', marginTop: 4, fontWeight: 600 }}>{preview.subject}</div>
                                    </div>
                                    <div className="notification-template-preview-body">
                                        <div dangerouslySetInnerHTML={{ __html: preview.html }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                .notification-template-grid {
                    display: grid;
                    grid-template-columns: 320px minmax(0, 1fr);
                    gap: 20px;
                    align-items: start;
                }
                .notification-template-library-card,
                .notification-template-editor-card,
                .notification-template-preview-card {
                    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
                }
                .notification-template-library-list {
                    display: grid;
                    gap: 0;
                }
                .notification-template-library-item {
                    text-align: left;
                    padding: 16px 18px;
                    border: none;
                    border-top: 1px solid var(--border);
                    background: transparent;
                    cursor: pointer;
                    transition: background 0.2s ease, transform 0.2s ease;
                }
                .notification-template-library-item:hover {
                    background: rgba(59, 130, 246, 0.04);
                }
                .notification-template-library-item.active {
                    background: linear-gradient(180deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.04));
                    box-shadow: inset 3px 0 0 var(--accent);
                }
                .notification-template-main {
                    display: grid;
                    gap: 20px;
                    min-width: 0;
                }
                .notification-template-toggle {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 13px;
                    color: var(--text-secondary);
                    background: var(--bg-input);
                    border: 1px solid var(--border);
                    border-radius: 999px;
                    padding: 8px 12px;
                    flex-shrink: 0;
                }
                .notification-template-chip-row {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                .notification-template-variable {
                    border: 1px solid var(--border);
                    background: linear-gradient(180deg, var(--bg-card), var(--bg-input));
                    color: var(--text-secondary);
                    border-radius: 999px;
                    padding: 6px 10px;
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .notification-template-variable:hover {
                    border-color: var(--accent);
                    color: var(--accent);
                    transform: translateY(-1px);
                }
                .notification-template-chip {
                    display: inline-flex;
                    align-items: center;
                    border-radius: 999px;
                    padding: 5px 9px;
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 0.02em;
                }
                .notification-template-chip-info {
                    background: #e0f2fe;
                    color: #075985;
                }
                .notification-template-chip-neutral {
                    background: #e2e8f0;
                    color: #334155;
                }
                .notification-template-chip-danger {
                    background: #fee2e2;
                    color: #991b1b;
                }
                .notification-template-preview-shell {
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    overflow: hidden;
                    background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
                }
                .notification-template-preview-subject {
                    padding: 14px 16px;
                    background: rgba(255, 255, 255, 0.75);
                    border-bottom: 1px solid var(--border);
                }
                .notification-template-preview-body {
                    padding: 18px;
                    background: #ffffff;
                    color: #0f172a;
                    min-height: 320px;
                    overflow: auto;
                }
                .notification-template-empty {
                    padding: 24px 18px 28px;
                    color: var(--text-muted);
                    font-size: 13px;
                    line-height: 1.6;
                    border-top: 1px solid var(--border);
                }
                @media (max-width: 1180px) {
                    .notification-template-grid {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </>
    )
}
