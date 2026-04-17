// src/pages/Dashboard.jsx
import { useEffect, useState } from 'react'
import Topbar from '../components/Layout/Topbar'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import DashboardView from '../components/Dashboard/DashboardView'

const ROLE_SCOPE_LABELS = {
    superadmin: 'All tickets — Super Admin view',
    gm: 'Tickets at escalation L3+ — GM view',
    manager: 'Tickets at escalation L2+ — Manager view',
    tl: 'Your team tickets — TL view',
    agent: 'Your assigned tickets — Agent view',
}

const ROLE_BADGE_COLORS = {
    superadmin: { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6' },
    gm: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' },
    manager: { bg: 'rgba(249,115,22,0.12)', color: '#f97316' },
    tl: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' },
    agent: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
}

export default function Dashboard() {
    const { user } = useAuth()
    const roleBadge = ROLE_BADGE_COLORS[user?.role] || ROLE_BADGE_COLORS.agent

    return (
        <>
            <Topbar
                title="Dashboard"
                subtitle={
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ background: roleBadge.bg, color: roleBadge.color, padding: '1px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>
                            {user?.role}
                        </span>
                        <span>{ROLE_SCOPE_LABELS[user?.role] || 'Support performance overview'}</span>
                    </span>
                }
                actions={<Link to="/tickets/new" className="btn btn-primary btn-sm">+ New Ticket</Link>}
            />

            <div className="page-body">
                <DashboardView targetUserId={null} isPortal={false} />
            </div>
        </>
    )
}
