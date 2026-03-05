// src/pages/BulkImport.jsx
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import toast from 'react-hot-toast'

// ── CRM field definitions ──────────────────────────────────────────────
const CRM_FIELDS = [
    { key: 'customer', label: 'Customer', required: true, hint: 'Customer name or code' },
    { key: 'project', label: 'Project', required: true, hint: 'Project name under that customer' },
    { key: 'category', label: 'Category', required: true, hint: 'Issue type' },
    { key: 'priority', label: 'Priority', required: true, hint: 'P1–P5 or Critical/High/Medium/Low' },
    { key: 'description', label: 'Description', required: true, hint: 'Full issue description' },
    { key: 'source', label: 'Source', required: false, hint: 'email / call / manual' },
    { key: 'assigned_to', label: 'Assign To', required: false, hint: 'Agent name or email' },
    { key: 'notes', label: 'Notes', required: false, hint: 'Internal notes (added to activity log)' },
    { key: 'email', label: 'Customer Email', required: false, hint: 'For email notifications' },
    { key: 'phone', label: 'Contact Number', required: false, hint: 'For SMS/Contact notifications' },
]

// ── Smart auto-suggest header → CRM field ─────────────────────────────
const AUTO_SUGGESTIONS = {
    customer: ['customer', 'account', 'client', 'company', 'organization', 'org'],
    project: ['project', 'product', 'service', 'department', 'dept'],
    category: ['category', 'type', 'issue type', 'topic', 'class', 'kind'],
    priority: ['priority', 'severity', 'urgency', 'impact', 'level'],
    description: ['description', 'issue', 'summary', 'subject', 'title', 'detail', 'body', 'problem'],
    source: ['source', 'channel', 'medium', 'origin', 'via', 'from'],
    assigned_to: ['assigned_to', 'agent', 'owner', 'assignee', 'responsible', 'rep', 'staff', 'member'],
    notes: ['notes', 'comment', 'remarks', 'note', 'additional', 'detail', 'info'],
    email: ['email', 'mail', 'e-mail', 'customer_email'],
    phone: ['phone', 'contact', 'mobile', 'call', 'telephone', 'number', 'cell'],
}
const autoMatch = (header) => {
    const h = header.toLowerCase().trim()
    for (const [field, keywords] of Object.entries(AUTO_SUGGESTIONS)) {
        if (keywords.some(k => h.includes(k))) return field
    }
    return ''
}

// ── CSV parser ─────────────────────────────────────────────────────────
function parseCSV(text) {
    const lines = text.trim().split('\n').filter(Boolean)
    if (lines.length < 2) return { headers: [], rows: [] }
    const parseRow = (line) => {
        const cols = []
        let cur = '', inQ = false
        for (const ch of line) {
            if (ch === '"') { inQ = !inQ }
            else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
            else cur += ch
        }
        cols.push(cur.trim())
        return cols
    }
    const headers = parseRow(lines[0])
    const rows = lines.slice(1).map(l => parseRow(l))
    return { headers, rows }
}

// ── Priority normaliser (shown in preview) ─────────────────────────────
const normPriority = (v = '') => {
    const u = String(v).trim().toUpperCase()
    if (['P1', 'P2', 'P3', 'P4', 'P5'].includes(u)) return u
    if (u === 'CRITICAL') return 'P1'
    if (u === 'HIGH') return 'P2'
    if (['MEDIUM', 'NORMAL'].includes(u)) return 'P3'
    if (u === 'LOW') return 'P4'
    if (['MINIMAL', 'VERY LOW'].includes(u)) return 'P5'
    return 'P3'
}

const normSource = (v = '') => {
    const s = String(v).toLowerCase().trim()
    if (['email', 'call', 'manual'].includes(s)) return s
    if (s === 'phone') return 'call'
    return 'manual'
}

const STEP_LABELS = ['Data Source', 'Field Mapping', 'Verification', 'Finish']
const PRI_COLORS = { P1: '#ef4444', P2: '#f97316', P3: '#f59e0b', P4: '#22c55e', P5: '#6b7280' }

const ICON_UPLOAD = <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
const ICON_CHECK = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
const ICON_ERROR = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
const ICON_HELP = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
const ICON_FILE_DOWNLOAD = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>

export default function BulkImport() {
    const navigate = useNavigate()
    const fileRef = useRef()

    const [step, setStep] = useState(0)
    const [file, setFile] = useState(null)
    const [parsed, setParsed] = useState({ headers: [], rows: [] })
    const [mapping, setMapping] = useState({})      // { csvHeader: crmFieldKey }
    const [preview, setPreview] = useState([])
    const [importing, setImporting] = useState(false)
    const [results, setResults] = useState(null)
    const [dragOver, setDragOver] = useState(false)

    // ── Step 1: load file ──────────────────────────────────────────────
    const loadFile = (f) => {
        if (!f || !f.name.endsWith('.csv')) return toast.error('Please upload a .csv file')
        setFile(f)
        const reader = new FileReader()
        reader.onload = (e) => {
            const result = parseCSV(e.target.result)
            setParsed(result)
            // Auto-map headers
            const autoMap = {}
            result.headers.forEach(h => {
                const match = autoMatch(h)
                if (match) autoMap[h] = match
            })
            setMapping(autoMap)
        }
        reader.readAsText(f)
    }

    const handleDrop = (e) => {
        e.preventDefault(); setDragOver(false)
        loadFile(e.dataTransfer.files[0])
    }

    // ── Step 2 → 3: build preview ──────────────────────────────────────
    const buildPreview = () => {
        const rows = parsed.rows.map((r, i) => {
            const obj = {}
            parsed.headers.forEach((h, idx) => {
                const crm = mapping[h]
                if (crm) obj[crm] = r[idx] ?? ''
            })

            const errors = []
            if (!obj.customer?.trim()) errors.push('customer missing')
            if (!obj.project?.trim()) errors.push('project missing')
            if (!obj.category?.trim()) errors.push('category missing')
            if (!obj.description?.trim()) errors.push('description missing')
            if (obj.priority) obj.priority = normPriority(obj.priority)
            else obj.priority = 'P3'

            if (obj.source) obj.source = normSource(obj.source)
            else obj.source = 'manual'

            return { rowNum: i + 2, ...obj, errors }
        })
        setPreview(rows)
        setStep(2)
    }

    const validRows = preview.filter(r => r.errors.length === 0)
    const invalidRows = preview.filter(r => r.errors.length > 0)

    // ── Step 3 → 4: import ────────────────────────────────────────────
    const runImport = async () => {
        setImporting(true)
        try {
            const { data } = await api.post('/tickets/import', { rows: validRows })
            setResults(data)
            setStep(3)
        } catch (err) {
            toast.error(err.response?.data?.message || 'Import failed')
        }
        setImporting(false)
    }

    // ── Download error report ─────────────────────────────────────────
    const downloadErrors = () => {
        const failures = results?.failed || []
        if (!failures.length) return
        const csv = 'Row,Reason\n' + failures.map(f => `${f.row},"${f.reason}"`).join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = 'import_errors.csv'; a.click()
        URL.revokeObjectURL(url)
    }

    // ── Download sample CSV ───────────────────────────────────────────
    const downloadSample = () => {
        const sample = `customer,project,category,priority,description,assigned_to,notes
"Acme Corp","Portal Project","Technical Issue","High","Login page returns 500 error","agent@company.com","Reported by user on 2025-03-01"
"Beta Ltd","Mobile App","Billing","P2","Invoice PDF not generating","","Check billing module"
`
        const blob = new Blob([sample], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = 'sample_import.csv'; a.click()
        URL.revokeObjectURL(url)
    }

    // ── Styles ────────────────────────────────────────────────────────
    const s = {
        stepper: { display: 'flex', gap: 0, marginBottom: 28 },
        stepItem: (active, done) => ({
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, position: 'relative'
        }),
        stepCircle: (active, done) => ({
            width: 34, height: 34, borderRadius: '50%',
            background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--bg-input)',
            border: `2px solid ${done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: done || active ? '#fff' : 'var(--text-muted)',
            zIndex: 1, transition: 'all 0.25s'
        }),
        stepLabel: (active) => ({
            fontSize: 11, fontWeight: active ? 700 : 500,
            color: active ? 'var(--text-primary)' : 'var(--text-muted)', textAlign: 'center'
        }),
        stepLine: { position: 'absolute', top: 17, left: '50%', width: '100%', height: 2, background: 'var(--border-subtle)', zIndex: 0 },
    }

    return (
        <>
            <Topbar
                title="Bulk Import Tickets"
                subtitle="Upload a CSV to create multiple tickets at once"
                actions={
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-secondary btn-sm" onClick={downloadSample}>⬇ Sample CSV</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/tickets')}>← Back</button>
                    </div>
                }
            />

            <div className="page-body">
                {/* ── Stepper ── */}
                <div style={s.stepper}>
                    {STEP_LABELS.map((lbl, i) => (
                        <div key={i} style={s.stepItem(i === step, i < step)}>
                            {i < STEP_LABELS.length - 1 && <div style={s.stepLine} />}
                            <div style={s.stepCircle(i === step, i < step)}>
                                {i < step ? '✓' : i + 1}
                            </div>
                            <div style={s.stepLabel(i === step)}>{lbl}</div>
                        </div>
                    ))}
                </div>

                {/* ── STEP 0: Upload ── */}
                {step === 0 && (
                    <div className="card" style={{ maxWidth: 640 }}>
                        <div className="card-title" style={{ marginBottom: 6 }}>Upload CSV File</div>
                        <div className="card-subtitle" style={{ marginBottom: 20 }}>
                            Headers are auto-detected. Any column names work — you'll map them in the next step.
                        </div>

                        {/* Drop zone */}
                        <div
                            style={{
                                border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
                                borderRadius: 14, padding: '40px 24px', textAlign: 'center',
                                background: dragOver ? 'var(--accent-light)' : 'var(--bg-input)',
                                cursor: 'pointer', transition: 'all 0.2s', marginBottom: 16,
                            }}
                            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                            onClick={() => fileRef.current.click()}
                        >
                            <div style={{ color: 'var(--accent)', marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
                            </div>
                            {file ? (
                                <>
                                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15 }}>{file.name}</div>
                                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                                        {parsed.rows.length} data rows · {parsed.headers.length} columns detected
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>Drag & drop your CSV here</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>or click to browse</div>
                                </>
                            )}
                        </div>
                        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => loadFile(e.target.files[0])} />

                        {/* Detected headers preview */}
                        {parsed.headers.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>DETECTED COLUMNS</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {parsed.headers.map(h => (
                                        <span key={h} style={{ background: 'var(--accent-light)', color: 'var(--accent)', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{h}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Required fields hint */}
                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>REQUIRED FIELDS IN YOUR CSV</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {CRM_FIELDS.filter(f => f.required).map(f => (
                                    <span key={f.key} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        <span style={{ color: 'var(--danger)', marginRight: 2 }}>*</span>{f.label}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="btn-row">
                            <button
                                className="btn btn-primary"
                                disabled={!file || parsed.rows.length === 0}
                                onClick={() => setStep(1)}
                            >
                                Next: Map Columns →
                            </button>
                        </div>
                    </div>
                )}

                {/* ── STEP 1: Map Columns ── */}
                {step === 1 && (
                    <div className="card" style={{ maxWidth: 720 }}>
                        <div className="card-title" style={{ marginBottom: 4 }}>Map CSV Columns → CRM Fields</div>
                        <div className="card-subtitle" style={{ marginBottom: 20 }}>
                            Auto-matched where possible. Adjust any that are wrong. Required fields marked <span style={{ color: 'var(--danger)' }}>*</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                            {parsed.headers.map(h => (
                                <div key={h} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
                                    <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
                                        {h}
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: 18 }}>→</div>
                                    <select
                                        className="input"
                                        value={mapping[h] || ''}
                                        onChange={e => setMapping(m => ({ ...m, [h]: e.target.value }))}
                                    >
                                        <option value="">— Skip this column —</option>
                                        {CRM_FIELDS.map(f => (
                                            <option key={f.key} value={f.key}>
                                                {f.required ? '* ' : ''}{f.label} — {f.hint}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>

                        {/* Validation: check all required fields are mapped */}
                        {(() => {
                            const mappedFields = new Set(Object.values(mapping).filter(Boolean))
                            const missing = CRM_FIELDS.filter(f => f.required && !mappedFields.has(f.key))
                            return missing.length > 0 && (
                                <div style={{ background: 'var(--danger-bg)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--danger)' }}>
                                    ⚠ Required fields not mapped: {missing.map(f => f.label).join(', ')}
                                </div>
                            )
                        })()}

                        <div className="btn-row">
                            <button className="btn btn-secondary" onClick={() => setStep(0)}>← Back</button>
                            <button
                                className="btn btn-primary"
                                onClick={buildPreview}
                                disabled={CRM_FIELDS.filter(f => f.required).some(f => !Object.values(mapping).includes(f.key))}
                            >
                                Next: Preview →
                            </button>
                        </div>
                    </div>
                )}

                {/* ── STEP 2: Preview & Validate ── */}
                {step === 2 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Summary bar */}
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {[
                                { label: 'Total Rows', value: preview.length, color: 'var(--accent)' },
                                { label: 'Ready to Import', value: validRows.length, color: 'var(--success)' },
                                { label: 'Errors Found', value: invalidRows.length, color: 'var(--danger)' },
                            ].map(s => (
                                <div key={s.label} style={{ flex: 1, minWidth: 160, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '14px 18px' }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
                                    <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
                                </div>
                            ))}
                        </div>

                        <div className="card" style={{ padding: 0 }}>
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>#</th><th>Status</th><th>Customer</th><th>Project</th>
                                            <th>Category</th><th>Priority</th><th>Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.map(r => (
                                            <tr key={r.rowNum} style={{ background: r.errors.length ? 'rgba(239,68,68,0.04)' : undefined }}>
                                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.rowNum}</td>
                                                <td>
                                                    {r.errors.length === 0
                                                        ? <span className="badge badge-resolved" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{ICON_CHECK} Valid</span>
                                                        : <span title={r.errors.join(', ')} className="badge badge-in_progress" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{ICON_ERROR} {r.errors.length} error{r.errors.length > 1 ? 's' : ''}</span>
                                                    }
                                                </td>
                                                <td style={{ maxWidth: 120 }}>{r.customer || <span style={{ color: 'var(--danger)' }}>—</span>}</td>
                                                <td style={{ maxWidth: 120 }}>{r.project || <span style={{ color: 'var(--danger)' }}>—</span>}</td>
                                                <td>{r.category}</td>
                                                <td>
                                                    {r.priority && <span style={{ background: `${PRI_COLORS[r.priority]}15`, color: PRI_COLORS[r.priority], padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{r.priority}</span>}
                                                </td>
                                                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-secondary)' }}>
                                                    {r.description}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {invalidRows.length > 0 && (
                            <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '14px 18px' }}>
                                <div style={{ fontWeight: 700, color: 'var(--danger)', marginBottom: 8, fontSize: 13 }}>Error Details</div>
                                {invalidRows.map(r => (
                                    <div key={r.rowNum} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                                        Row {r.rowNum}: <span style={{ color: 'var(--danger)' }}>{r.errors.join(' · ')}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="btn-row">
                            <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
                            <button
                                className="btn btn-primary"
                                disabled={validRows.length === 0 || importing}
                                onClick={runImport}
                                style={{ minWidth: 180 }}
                            >
                                {importing
                                    ? <><span className="spinner" style={{ width: 14, height: 14 }} />Importing…</>
                                    : `Import ${validRows.length} Ticket${validRows.length !== 1 ? 's' : ''}`
                                }
                            </button>
                        </div>
                    </div>
                )}

                {/* ── STEP 3: Results ── */}
                {step === 3 && results && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
                        {/* Result cards */}
                        <div style={{ display: 'flex', gap: 12 }}>
                            {[
                                { label: 'Total Processed', value: results.summary.total, color: 'var(--accent)' },
                                { label: 'Successfully Created', value: results.summary.created, color: 'var(--success)' },
                                { label: 'Failed to Import', value: results.summary.failed, color: 'var(--danger)' },
                            ].map(s => (
                                <div key={s.label} style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '18px 20px' }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
                                    <div style={{ fontSize: 32, fontWeight: 800, color: s.color }}>{s.value}</div>
                                </div>
                            ))}
                        </div>

                        {results.created.length > 0 && (
                            <div className="card">
                                <div className="card-title" style={{ marginBottom: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {ICON_CHECK} Successfully Created
                                </div>
                                <div className="table-wrap">
                                    <table>
                                        <thead><tr><th>Row</th><th>Ticket #</th><th>Customer</th></tr></thead>
                                        <tbody>
                                            {results.created.map(c => (
                                                <tr key={c.ticket_number}>
                                                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.row}</td>
                                                    <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{c.ticket_number}</td>
                                                    <td>{c.customer}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {results.failed.length > 0 && (
                            <div className="card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <div className="card-title" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {ICON_ERROR} Failed Rows
                                    </div>
                                    <button className="btn btn-secondary btn-sm" onClick={downloadErrors} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {ICON_FILE_DOWNLOAD} Download Error CSV
                                    </button>
                                </div>
                                <div className="table-wrap">
                                    <table>
                                        <thead><tr><th>Row</th><th>Reason</th></tr></thead>
                                        <tbody>
                                            {results.failed.map(f => (
                                                <tr key={f.row}>
                                                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f.row}</td>
                                                    <td style={{ color: 'var(--danger)', fontSize: 13 }}>{f.reason}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div className="btn-row">
                            <button className="btn btn-primary" onClick={() => navigate('/tickets')}>View All Tickets</button>
                            <button className="btn btn-secondary" onClick={() => { setStep(0); setFile(null); setParsed({ headers: [], rows: [] }); setResults(null) }}>
                                Import Another File
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}
