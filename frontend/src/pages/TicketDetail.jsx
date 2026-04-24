// src/pages/TicketDetail.jsx
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import Topbar from '../components/Layout/Topbar'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../hooks/useSocket'
import toast from 'react-hot-toast'
import CountdownBadge from '../components/Tickets/CountdownBadge'

function StatusBadge({ s }) { return <span className={`badge badge-${s}`}>{s?.replace('_', ' ')}</span> }
function PriorityBadge({ p }) { return <span className={`priority-badge p${p?.[1]}-badge`}>{p}</span> }
function LevelBadge({ l }) { return <span className={`level-badge level-${l}`}>Level {l}</span> }

const STATUS_OPTIONS = ['open', 'in_progress', 'pending', 'resolved', 'closed']
const PRIORITY_OPTIONS = ['P1', 'P2', 'P3', 'P4', 'P5']
const PRIORITY_COLORS = { P1: '#ef4444', P2: '#f97316', P3: '#f59e0b', P4: '#22c55e', P5: '#6b7280' }
const ESCALATION_COLORS = { 1: '#3b82f6', 2: '#f59e0b', 3: '#f97316', 4: '#ef4444' }

const ICON_CLOCK = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const ICON_USER = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
const ICON_LAYERS = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
const ICON_TAG = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
const ICON_CHECK = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
const ICON_ALERT = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>

function formatConversationBody(message) {
    const raw = String(message?.message_body || '').replace(/\r\n/g, '\n').trim()
    if (!raw) return ''

    let text = raw

    if (message?.sender_type === 'customer') {
        const cutPatterns = [
            /\nOn .{0,220}wrote:/i,
            /\nFrom:\s.*\nSent:\s.*\nTo:\s/i,
            /\nConversation History/i,
            /\nReply Tip:/i,
            /\nTicket Update:\s*TKT-/i,
            /\n-{2,}\s*Original Message\s*-{2,}/i
        ]

        for (const pattern of cutPatterns) {
            const idx = text.search(pattern)
            // Apply only when there is enough real text before quote block.
            if (idx > 30) {
                text = text.slice(0, idx).trim()
                break
            }
        }

        // Remove quoted lines copied from previous thread
        text = text
            .split('\n')
            .filter(line => !line.trim().startsWith('>'))
            .join('\n')

        // Keep signatures only when body is very long; avoid hiding short replies.
        const signatureIdx = text.search(/\n(\*?regards\*?|thanks(?: and regards)?|best regards?|cheers)\b/i)
        if (signatureIdx > 40 && text.length > 250) {
            text = text.slice(0, signatureIdx).trim()
        }
    }

    text = text.replace(/\n{3,}/g, '\n\n').trim()
    return text || raw
}

export default function TicketDetail() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()
    const { socket } = useSocket() || {}
    const chatEndRef = useRef(null)

    const [ticket, setTicket] = useState(null)
    const [logs, setLogs] = useState([])
    const [activity, setActivity] = useState([])
    const [tasks, setTasks] = useState([])
    const [conversation, setConversation] = useState(null)
    const [messages, setMessages] = useState([])

    const [loading, setLoading] = useState(true)
    const [updating, setUpdating] = useState(false)
    const [sending, setSending] = useState(false)

    useEffect(() => {
        if (!socket || !id) return;

        socket.on('new_message', (msg) => {
            // Only care about messages for THIS ticket
            if (String(msg.ticket_id) === String(id)) {
                setMessages(prev => {
                    // Avoid duplicates if loadData also triggered
                    if (prev.some(m => m.id === msg.id)) return prev;
                    return [...prev, msg];
                });
            }
        });

        return () => {
            socket.off('new_message');
        };
    }, [socket, id])

    // Sidebar form states
    const [status, setStatus] = useState('')
    const [assignedTo, setAssignedTo] = useState('')
    const [queueId, setQueueId] = useState('')
    const [assignUsers, setAssignUsers] = useState([])
    const [queues, setQueues] = useState([])
    const [priorities, setPriorities] = useState([])

    // Conversation
    const [messageBody, setMessageBody] = useState('')
    const [isInternal, setIsInternal] = useState(false)
    const [activeTab, setActiveTab] = useState('conversation') // 'conversation' | 'activity'

    // Tasks
    const [taskTitle, setTaskTitle] = useState('')

    // Attachments
    const [selectedFiles, setSelectedFiles] = useState([])
    const fileInputRef = useRef(null)

    // Modals
    const [escalateReason, setEscalateReason] = useState('')
    const [showEscModal, setShowEscModal] = useState(false)
    const [showPriModal, setShowPriModal] = useState(false)
    const [newPriority, setNewPriority] = useState('')
    const [priReason, setPriReason] = useState('')

    const loadData = useCallback(async () => {
        try {
            const [ticketRes, convRes, userRes, queueRes, prioRes] = await Promise.all([
                api.get(`/tickets/${id}`),
                api.get(`/tickets/${id}/conversation`),
                api.get('/users'),
                api.get('/queues'),
                api.get('/sla/priorities')
            ])
            setTicket(ticketRes.data.ticket)
            setLogs(ticketRes.data.escalation_logs)
            setActivity(ticketRes.data.activity)
            setTasks(ticketRes.data.tasks || [])
            setStatus(ticketRes.data.ticket.status)
            setAssignedTo(ticketRes.data.ticket.assigned_to || '')
            setQueueId(ticketRes.data.ticket.queue_id || '')
            setConversation(convRes.data.conversation)
            setMessages(convRes.data.messages || [])
            setAssignUsers(userRes.data.users)
            setQueues(queueRes.data.queues)
            setPriorities(prioRes.data.priorities || [])
            setLoading(false)
        } catch (err) {
            console.error(err)
            setLoading(false)
        }
    }, [id])

    useEffect(() => { loadData() }, [loadData])

    useEffect(() => {
        if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleUpdate = async () => {
        setUpdating(true)
        try {
            await api.put(`/tickets/${id}`, { status, assigned_to: assignedTo || null })
            if (queueId !== (ticket.queue_id || '')) {
                await api.put(`/tickets/${id}/queue`, { queue_id: queueId || null })
            }
            toast.success('Ticket updated!')
            loadData()
        } catch (err) { toast.error(err.response?.data?.message || 'Update failed') }
        setUpdating(false)
    }

    const handleSlaHold = async (action, reason = '') => {
        try {
            await api.put(`/tickets/${id}/sla-hold`, { action, reason })
            toast.success(`SLA ${action === 'pause' ? 'Paused' : 'Resumed'}`)
            loadData()
        } catch (err) { toast.error(err.response?.data?.message || 'SLA Action failed') }
    }

    const handleSendMessage = async (e) => {
        e.preventDefault()
        if ((!messageBody.trim() && selectedFiles.length === 0) || sending) return
        setSending(true)
        try {
            const formData = new FormData();
            formData.append('message_body', messageBody);
            formData.append('is_internal_note', isInternal ? '1' : '0');
            
            selectedFiles.forEach(file => {
                formData.append('attachments', file);
            });

            await api.post(`/tickets/${id}/conversation/messages`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setMessageBody('')
            setSelectedFiles([])
            if (fileInputRef.current) fileInputRef.current.value = ''
            loadData()
        } catch { toast.error('Failed to send message') }
        setSending(false)
    }

    const handleDownload = async (attachmentId, originalName) => {
        const downloadToast = toast.loading(`Downloading ${originalName}...`);
        try {
            const response = await api.get(`/tickets/${id}/attachments/${attachmentId}`, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', originalName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success('Download complete', { id: downloadToast });
        } catch (err) {
            toast.error('Download failed', { id: downloadToast });
        }
    }

    const handleAddTask = async (e) => {
        e.preventDefault()
        if (!taskTitle.trim()) return
        try {
            await api.post(`/tickets/${id}/tasks`, { title: taskTitle })
            setTaskTitle('')
            loadData()
        } catch { toast.error('Failed to add task') }
    }

    const toggleTask = async (task) => {
        try {
            await api.put(`/tickets/${id}/tasks/${task.id}`, { is_done: !task.is_done })
            loadData()
        } catch { toast.error('Failed to update task') }
    }

    const handlePriorityChange = async () => {
        try {
            await api.put(`/tickets/${id}/priority`, { priority: newPriority, reason: priReason })
            toast.success('Priority updated')
            setShowPriModal(false)
            loadData()
        } catch { toast.error('Priority change failed') }
    }

    const handleEscalate = async () => {
        try {
            await api.post(`/tickets/${id}/escalate`, { reason: escalateReason })
            toast.success('Ticket escalated!')
            setShowEscModal(false)
            loadData()
        } catch { toast.error('Escalation failed') }
    }

    if (loading) return <><Topbar title="Ticket Detail" /><div className="loader-center"><div className="spinner spinner-lg" /></div></>
    if (!ticket) return <><Topbar title="Ticket Detail" /><div className="page-body"><div className="empty-state">Ticket not found</div></div></>

    const isOverdue = ticket.etr && new Date(ticket.etr) < new Date() && !['resolved', 'closed'].includes(ticket.status)
    const canEscalate = ['superadmin', 'gm', 'manager', 'tl', 'agent'].includes(user?.role)
    const priColor = PRIORITY_COLORS[ticket.priority] || '#6b7280'
    const escColor = ESCALATION_COLORS[ticket.escalation_level] || '#3b82f6'
    const doneTasks = tasks.filter(t => t.is_done).length

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Topbar
                title={ticket.ticket_number}
                subtitle={`${ticket.customer_name} › ${ticket.project_name}`}
                actions={
                    <div className="btn-row">
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/tickets/${id}/edit`)}>Edit</button>
                        {isOverdue && <span className="badge" style={{ background: '#fee2e2', color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                            {ICON_ALERT} Overdue
                        </span>}
                        {canEscalate && ticket.escalation_level < 4 && (
                            <button className="btn btn-danger btn-sm" onClick={() => setShowEscModal(true)}>↑ Escalate</button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/tickets')}>← Back</button>
                    </div>
                }
            />

            <div className="page-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20, padding: 20, alignItems: 'start' }}>

                {/* ═══ Left Column: Ticket Info + Tasks + Conversation ═══ */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* ── Hero Info Card ── */}
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        {/* Colored accent bar based on priority */}
                        <div style={{ height: 4, background: `linear-gradient(90deg, ${priColor}, ${priColor}80)` }} />
                        <div style={{ padding: '20px 24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
                                <div style={{ flex: 1 }}>
                                    <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{ticket.category}</h2>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                        <StatusBadge s={ticket.status} />
                                        <LevelBadge l={ticket.escalation_level} />
                                        {ticket.queue_name && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'var(--accent-light)', color: 'var(--accent)' }}>
                                                {ICON_LAYERS} {ticket.queue_name}
                                            </span>
                                        )}
                                        {isOverdue && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#fee2e2', color: '#ef4444' }}>
                                                {ICON_ALERT} Overdue
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div
                                    onClick={() => { setNewPriority(ticket.priority); setShowPriModal(true) }}
                                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}
                                    title="Click to change priority"
                                >
                                    <PriorityBadge p={ticket.priority} />
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Click to change</span>
                                </div>
                            </div>

                            {/* Description */}
                            <div style={{ background: 'var(--bg-input)', borderRadius: 10, padding: '14px 16px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, border: '1px solid var(--border)', whiteSpace: 'pre-wrap' }}>
                                {ticket.description}
                            </div>

                            {/* Meta row */}
                            <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
                                {[
                                    { icon: ICON_USER, label: 'Assigned To', value: ticket.assigned_to_name || '— Unassigned' },
                                    { icon: ICON_TAG, label: 'Source', value: ticket.source || 'manual' },
                                    { icon: ICON_CLOCK, label: 'Created', value: new Date(ticket.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
                                    { icon: ICON_CLOCK, label: 'ETR', value: ticket.etr ? new Date(ticket.etr).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—', highlight: isOverdue },
                                ].map(m => (
                                    <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ color: 'var(--accent)', display: 'flex' }}>{m.icon}</span>
                                        <div>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{m.label}</div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: m.highlight ? '#ef4444' : 'var(--text-primary)' }}>{m.value}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Sub-Tasks Card ── */}
                    <div className="card" style={{ padding: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <h3 className="card-title" style={{ margin: 0 }}>Sub-Tasks</h3>
                            {tasks.length > 0 && (
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{doneTasks}/{tasks.length} done</span>
                            )}
                        </div>

                        {/* Progress bar */}
                        {tasks.length > 0 && (
                            <div style={{ height: 4, background: 'var(--bg-input)', borderRadius: 4, marginBottom: 14, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${(doneTasks / tasks.length) * 100}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width 0.3s' }} />
                            </div>
                        )}

                        <form onSubmit={handleAddTask} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                            <input className="input" style={{ fontSize: 13 }} placeholder="Add a task or checklist item…" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} />
                            <button className="btn btn-secondary" type="submit" style={{ whiteSpace: 'nowrap' }}>Add</button>
                        </form>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {tasks.map(t => (
                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: t.is_done ? 'rgba(34,197,94,0.06)' : 'var(--bg-card-hover)', border: `1px solid ${t.is_done ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`, transition: 'all 0.2s' }}>
                                    <div
                                        onClick={() => toggleTask(t)}
                                        style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${t.is_done ? '#22c55e' : 'var(--border)'}`, background: t.is_done ? '#22c55e' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}
                                    >
                                        {t.is_done && <span style={{ color: '#fff', display: 'flex' }}>{ICON_CHECK}</span>}
                                    </div>
                                    <span style={{ flex: 1, fontSize: 13, textDecoration: t.is_done ? 'line-through' : 'none', opacity: t.is_done ? 0.5 : 1, transition: 'all 0.2s' }}>{t.title}</span>
                                    {t.assigned_to_name && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>@{t.assigned_to_name}</span>}
                                </div>
                            ))}
                            {tasks.length === 0 && <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: 12 }}>No sub-tasks yet — add one above</div>}
                        </div>
                    </div>

                    {/* ── Conversation + Activity Tabs ── */}
                    <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 480 }}>
                        {/* Tab Nav */}
                        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                            {[
                                { key: 'conversation', label: `💬 Conversation${messages.length ? ` (${messages.length})` : ''}` },
                                { key: 'activity', label: `📋 Activity Log${activity.length ? ` (${activity.length})` : ''}` },
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => setActiveTab(tab.key)}
                                    style={{
                                        padding: '12px 20px', fontSize: 13, fontWeight: 600,
                                        background: 'transparent', border: 'none', cursor: 'pointer',
                                        borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                                        color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-secondary)',
                                        transition: 'all 0.15s'
                                    }}
                                >{tab.label}</button>
                            ))}
                        </div>

                        {activeTab === 'conversation' ? (
                            <>
                                {/* Messages */}
                                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--bg-app)', minHeight: 300 }}>
                                    {messages.length === 0 && (
                                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 40 }}>No messages yet — start the conversation below</div>
                                    )}
                                    {messages.map(m => {
                                        const isCustomer = m.sender_type === 'customer'
                                        const isSystem = m.sender_type === 'system'
                                        const isAgent = m.sender_type === 'agent'
                                        const onRight = !isCustomer

                                        // Fallback name logic
                                        const displayName = m.sender_name || (isSystem ? 'System' : (isAgent ? 'Agent' : 'Customer'))

                                        return (
                                            <div key={m.id} style={{ maxWidth: '82%', alignSelf: onRight ? 'flex-end' : 'flex-start', display: 'flex', flexDirection: 'column', alignItems: onRight ? 'flex-end' : 'flex-start' }}>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, padding: '0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ fontWeight: 600 }}>{displayName}</span>
                                                    {m.sender_role && (
                                                        <span style={{ fontSize: 10, background: 'rgba(59,130,246,0.1)', color: 'var(--accent)', padding: '2px 6px', borderRadius: 4, fontWeight: 600, letterSpacing: 0.3 }}>
                                                            {m.sender_role.replace(/_/g, ' ').toUpperCase()}
                                                        </span>
                                                    )}
                                                    <span>·</span>
                                                    <span>{new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                                                    {m.is_internal_note ? <span style={{ background: '#fef3c7', color: '#b45309', fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>INTERNAL</span> : ''}
                                                </div>
                                                <div style={{
                                                    padding: '10px 14px',
                                                    borderRadius: onRight ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                                                    fontSize: 13,
                                                    lineHeight: 1.6,
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word',
                                                    background: m.is_internal_note
                                                        ? '#fffbeb'
                                                        : isSystem ? 'var(--bg-input)' : isAgent ? 'var(--accent)' : 'var(--bg-card)',
                                                    color: m.is_internal_note
                                                        ? '#92400e'
                                                        : isAgent ? '#fff' : 'var(--text-primary)',
                                                    border: m.is_internal_note ? '1px solid #fde68a' : (isAgent ? 'none' : '1px solid var(--border)'),
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.07)'
                                                }}>
                                                    {formatConversationBody(m)}

                                                    {/* Render Attachments */}
                                                    {m.attachments && m.attachments.length > 0 && (
                                                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, borderTop: `1px solid ${onRight ? 'rgba(255,255,255,0.2)' : 'var(--border)'}`, paddingTop: 8 }}>
                                                            {m.attachments.map(att => (
                                                                <div 
                                                                    key={att.id} 
                                                                    onClick={() => handleDownload(att.id, att.original_name)}
                                                                    style={{ 
                                                                        display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer',
                                                                        padding: '4px 8px', borderRadius: 6, background: onRight ? 'rgba(255,255,255,0.1)' : 'var(--bg-input)',
                                                                        border: `1px solid ${onRight ? 'rgba(255,255,255,0.2)' : 'var(--border)'}`
                                                                    }}
                                                                >
                                                                    <span>📎</span>
                                                                    <span style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{att.original_name}</span>
                                                                    <span style={{ fontSize: 10, opacity: 0.7 }}>({(att.file_size / 1024).toFixed(1)} KB)</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                    <div ref={chatEndRef} />
                                </div>

                                {/* Compose */}
                                <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                                    {ticket.source === 'email' && !isInternal && (
                                        <div style={{ padding: '8px 12px', marginBottom: 10, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 12, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span>📧</span>
                                            <span>This reply will be sent via email to <strong>{ticket.customer_email || 'the customer'}</strong></span>
                                        </div>
                                    )}
                                    <form onSubmit={handleSendMessage} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <textarea
                                            className="input"
                                            placeholder={isInternal ? "✏️ Write an internal note (only visible to agents)…" : (ticket.source === 'email' ? "📧 Write an email reply to the customer…" : "💬 Write a reply to the customer…")}
                                            rows={3}
                                            style={{ resize: 'none', fontSize: 13, border: isInternal ? '1.5px solid #f59e0b' : undefined, background: isInternal ? '#fffbeb' : undefined }}
                                            value={messageBody}
                                            onChange={e => setMessageBody(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); } }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: isInternal ? '#fef3c7' : 'transparent', border: isInternal ? '1px solid #fde68a' : '1px solid transparent', transition: 'all 0.2s' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: isInternal ? '#b45309' : 'var(--text-secondary)', fontWeight: 600 }}>
                                                        <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} />
                                                        🔒 Internal Note
                                                    </label>
                                                </div>
                                                
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <input 
                                                        type="file" 
                                                        id="file-upload" 
                                                        multiple 
                                                        style={{ display: 'none' }} 
                                                        ref={fileInputRef}
                                                        onChange={(e) => setSelectedFiles(Array.from(e.target.files))}
                                                    />
                                                    <label htmlFor="file-upload" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent)', fontWeight: 600, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--accent)' }}>
                                                        📎 Attach
                                                    </label>
                                                    {selectedFiles.length > 0 && (
                                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedFiles.length} file(s)</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                {ticket.source === 'email' && isInternal && (
                                                    <span style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>⚠️ Private Note (Not Emailed)</span>
                                                )}
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Shift+Enter for new line</span>
                                                <button className={isInternal ? "btn btn-sm" : "btn btn-primary btn-sm"} type="submit" disabled={sending || (!messageBody.trim() && selectedFiles.length === 0)} style={isInternal ? { background: '#f59e0b', color: '#fff', border: 'none' } : {}}>
                                                    {sending ? 'Sending…' : (isInternal ? '📝 Add Note' : (ticket.source === 'email' ? '📧 Send Email' : '➤ Send Reply'))}
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            </>
                        ) : (
                            /* Activity Log Tab */
                            <div style={{ overflowY: 'auto', padding: 20, maxHeight: 500 }}>
                                {activity.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 20 }}>No activity yet</div>}
                                <div className="timeline">
                                    {activity.slice().reverse().map(a => (
                                        <div key={a.id} className="timeline-item" style={{ paddingBottom: 14 }}>
                                            <div className="timeline-line">
                                                <div className="timeline-dot" style={{ width: 8, height: 8 }} />
                                            </div>
                                            <div className="timeline-content">
                                                <div className="timeline-action" style={{ fontSize: 12, fontWeight: 700 }}>{a.action.replace(/_/g, ' ')}</div>
                                                {a.note && <div className="timeline-meta" style={{ fontSize: 12 }}>{a.note}</div>}
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    {a.performed_by_name && <span>by <strong>{a.performed_by_name}</strong> ·</span>}
                                                    {new Date(a.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {ticket.participants?.length > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                            <div style={{ minWidth: 14 }} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>CC</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                    {ticket.participants.map(email => (
                                                        <span key={email} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                                                            {email}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Escalation Logs */}
                                {logs.length > 0 && (
                                    <>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 10 }}>Escalation History</div>
                                        {logs.map(l => (
                                            <div key={l.id} style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', marginBottom: 8, fontSize: 12 }}>
                                                <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: 2 }}>Level {l.escalation_level} · {l.from_name} → {l.to_name}</div>
                                                {l.reason && <div style={{ color: 'var(--text-secondary)' }}>{l.reason}</div>}
                                                <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>{new Date(l.escalated_at).toLocaleString('en-IN')}</div>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══ Right Sidebar ═══ */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* ── Quick Stats Card ── */}
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card-hover)' }}>
                            <h3 className="card-title" style={{ margin: 0 }}>Ticket Details</h3>
                        </div>
                        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {/* SLA Info */}
                            {/* SLA Health Widget */}
                            <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--bg-input)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>SLA Health</span>
                                    <CountdownBadge 
                                        etr={ticket.etr} 
                                        paused={ticket.sla_paused === 1 || ticket.sla_paused_manual === 1} 
                                        status={ticket.status}
                                        sla_state={ticket.sla_state}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                                    <div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Created</div>
                                        <div style={{ fontSize: 12, fontWeight: 600 }}>
                                            {new Date(ticket.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>ETR Target</div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: isOverdue ? '#ef4444' : 'var(--text-primary)' }}>
                                            {ticket.etr ? new Date(ticket.etr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </div>
                                    </div>
                                </div>
                                
                                {ticket.sla_pause_reason && (
                                    <div style={{ fontSize: 11, color: '#b45309', background: '#fffbeb', padding: '6px 10px', borderRadius: 6, border: '1px solid #fde68a' }}>
                                        ⏸ {ticket.sla_pause_reason}
                                    </div>
                                )}

                                {['superadmin', 'manager'].includes(user?.role) && (
                                    <button 
                                        className="btn btn-sm" 
                                        style={{ 
                                            width: '100%', justifyContent: 'center', gap: 6,
                                            background: ticket.sla_paused_manual ? 'var(--accent)' : 'transparent',
                                            color: ticket.sla_paused_manual ? '#fff' : 'var(--text-primary)',
                                            border: ticket.sla_paused_manual ? 'none' : '1px solid var(--border)'
                                        }}
                                        onClick={() => {
                                            if (ticket.sla_paused_manual) {
                                                handleSlaHold('resume');
                                            } else {
                                                const r = prompt("Reason for pausing SLA (e.g., Client Wait, Vendor Hold):");
                                                if (r !== null) handleSlaHold('pause', r);
                                            }
                                        }}
                                    >
                                        {ticket.sla_paused_manual ? '▶ Resume Timer' : '⏸ Pause SLA (Hold)'}
                                    </button>
                                )}
                            </div>

                            {/* Escalation indicator */}
                            <div style={{ padding: '10px 12px', borderRadius: 8, background: `${escColor}10`, border: `1px solid ${escColor}30` }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Escalation Level</div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {[1, 2, 3, 4].map(l => (
                                        <div key={l} style={{ flex: 1, height: 6, borderRadius: 4, background: l <= ticket.escalation_level ? escColor : 'var(--border)', transition: 'background 0.2s' }} />
                                    ))}
                                </div>
                                <div style={{ fontSize: 11, color: escColor, fontWeight: 700, marginTop: 6 }}>
                                    Level {ticket.escalation_level} — {['Agent', 'Team Lead', 'Manager', 'GM'][ticket.escalation_level - 1]}
                                </div>
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0 }} />

                            {/* Editable fields */}
                            <div className="form-group">
                                <label className="form-label" style={{ fontSize: 11 }}>Status</label>
                                <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
                                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label" style={{ fontSize: 11 }}>Assignee</label>
                                <select className="input" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                                    <option value="">— Unassigned —</option>
                                    {assignUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label" style={{ fontSize: 11 }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{ICON_LAYERS} Queue</span>
                                </label>
                                <select className="input" value={queueId} onChange={e => setQueueId(e.target.value)}>
                                    <option value="">— No Queue —</option>
                                    {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                                </select>
                            </div>
                            <button className="btn btn-primary" onClick={handleUpdate} disabled={updating} style={{ width: '100%', justifyContent: 'center' }}>
                                {updating ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Saving…</> : '✓ Save Changes'}
                            </button>
                        </div>
                    </div>

                    {/* ── Attachment Card ── */}
                    {ticket.attachment_url && (
                        <div className="card" style={{ padding: 16 }}>
                            <h3 className="card-title" style={{ fontSize: 12, marginBottom: 10 }}>Attachment</h3>
                            <a
                                href={`${import.meta.env.VITE_API_BASE || 'http://localhost:5000'}${ticket.attachment_url}`}
                                target="_blank" rel="noreferrer"
                                style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                📎 View Attachment
                            </a>
                        </div>
                    )}

                    {/* ── Related Info ── */}
                    <div className="card" style={{ padding: 16 }}>
                        <h3 className="card-title" style={{ fontSize: 12, marginBottom: 12 }}>More Info</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { label: 'SOURCE', value: ticket.source || 'manual' },
                                { label: 'SLA STATE', value: ticket.sla_state || '—' },
                                { label: 'CREATED BY', value: ticket.created_by_name || '—' },
                            ].map(m => (
                                <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{m.label}</span>
                                    <span style={{ fontSize: 12, fontWeight: 600 }}>{m.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ Modals ═══ */}
            {showEscModal && (
                <div className="modal-overlay" onClick={() => setShowEscModal(false)}>
                    <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Manual Escalation</h3>
                        </div>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                            Escalating from Level {ticket.escalation_level} → Level {Math.min(ticket.escalation_level + 1, 4)}
                        </p>
                        <textarea className="input" placeholder="Reason for escalation (optional)…" value={escalateReason} onChange={e => setEscalateReason(e.target.value)} rows={3} />
                        <div className="modal-footer" style={{ marginTop: 16 }}>
                            <button className="btn btn-secondary" onClick={() => setShowEscModal(false)}>Cancel</button>
                            <button className="btn btn-danger" onClick={handleEscalate}>↑ Escalate Now</button>
                        </div>
                    </div>
                </div>
            )}

            {showPriModal && (
                <div className="modal-overlay" onClick={() => setShowPriModal(false)}>
                    <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h3 className="modal-title">Change Priority</h3></div>
                        <div className="form-group" style={{ marginTop: 16 }}>
                            <label className="form-label">New Priority</label>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                                {priorities.map(p => {
                                    const pColor = PRIORITY_COLORS[p.name] || 'var(--accent)';
                                    return (
                                        <button
                                            key={p.id} type="button"
                                            onClick={() => setNewPriority(p.name)}
                                            style={{
                                                padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                                border: `2px solid ${newPriority === p.name ? pColor : 'var(--border)'}`,
                                                background: newPriority === p.name ? `${pColor}15` : 'var(--bg-input)',
                                                color: newPriority === p.name ? pColor : 'var(--text-secondary)'
                                            }}
                                        >{p.name}</button>
                                    )
                                })}
                            </div>
                        </div>
                        <div className="form-group" style={{ marginTop: 12 }}>
                            <label className="form-label">Reason (optional)</label>
                            <textarea className="input" placeholder="Why is this priority changing?" value={priReason} onChange={e => setPriReason(e.target.value)} rows={2} />
                        </div>
                        <div className="modal-footer" style={{ marginTop: 16 }}>
                            <button className="btn btn-secondary" onClick={() => setShowPriModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handlePriorityChange} disabled={!newPriority}>Update Priority</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
