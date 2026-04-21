// src/components/Layout/Sidebar.jsx
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useEffect, useState } from 'react'
import api from '../../api/axios'

const DASHBOARD_ITEMS = [
    {
        label: 'Enterprise HQ', path: '/dashboard', end: true,
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
    },
    {
        label: 'Command Center', path: '/monitoring/command-center',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>,
        roles: ['superadmin', 'gm', 'manager']
    },
    {
        label: 'Queue Roster', path: '/monitoring/queues',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
        roles: ['superadmin', 'gm', 'manager']
    },
    {
        label: 'Agent Roster', path: '/monitoring/agents',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>,
        roles: ['superadmin', 'gm', 'manager']
    },
];

const NAV_ITEMS = [
    {
        label: 'All Tickets', path: '/tickets', end: true,
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>
    },
    {
        label: 'Analytics', path: '/analytics',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>,
        roles: ['superadmin', 'gm', 'manager']
    },
    {
        label: 'Create Ticket', path: '/tickets/new',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
    },
    {
        label: 'STR Queue', path: '/tickets/queue',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
        roles: ['superadmin', 'gm', 'manager', 'tl']
    },
    {
        label: 'Queues', path: '/queues',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>,
        roles: ['superadmin', 'gm', 'manager']
    },
]

const MGMT_ITEMS = [
    {
        label: 'Customers', path: '/customers',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
    },
    {
        label: 'Projects', path: '/projects',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
    },
    {
        label: 'Workflows', path: '/workflows',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>,
        roles: ['superadmin', 'gm', 'manager']
    },
    {
        label: 'Domain Approvals', path: '/approvals/domains',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
        roles: ['superadmin'],
        hasBadge: true
    },
    {
        label: 'User Admin', path: '/users',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" /></svg>,
        roles: ['superadmin', 'gm', 'manager']
    },
]

const CONFIG_ITEMS = [
    {
        label: 'Shifts', path: '/shifts',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
        roles: ['superadmin', 'gm', 'manager']
    },
    {
        label: 'SLA Settings', path: '/sla',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
        roles: ['superadmin', 'manager']
    },
    {
        label: 'Email Templates', path: '/notification-templates',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="m22 6-10 7L2 6"/></svg>,
        roles: ['superadmin', 'gm', 'manager']
    },
    {
        label: 'Holidays', path: '/holidays',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>,
        roles: ['superadmin']
    },
]

const SOURCE_ICONS = {
    email: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>,
    phone: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>,
    manual: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
    csv: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
}

import PresenceToggle from '../Shared/PresenceToggle'

export default function Sidebar() {
    const { user, logout, hasRole } = useAuth()
    const [pendingApprovals, setPendingApprovals] = useState(0)
    const [dashOpen, setDashOpen] = useState(true)

    // Fetch pending domain approval count for badge (superadmin only)
    useEffect(() => {
        if (hasRole('superadmin')) {
            const fetchCount = () => {
                api.get('/approvals/domains/pending-count').then(r => {
                    setPendingApprovals(r.data.count || 0)
                }).catch(() => {})
            }
            fetchCount()
            const interval = setInterval(fetchCount, 30000) // refresh every 30s
            return () => clearInterval(interval)
        }
    }, [hasRole])

    const filterItems = (items) => items.filter(i => !i.roles || i.roles.some(r => hasRole(r)))

    const visibleDash = filterItems(DASHBOARD_ITEMS)
    const visibleNav = filterItems(NAV_ITEMS)
    const visibleMgmt = filterItems(MGMT_ITEMS)
    const visibleConfig = filterItems(CONFIG_ITEMS)

    const renderItems = (items, isSub = false) =>
        items.map(item => (
            <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${isSub ? 'sub-nav' : ''}`}
            >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {item.hasBadge && pendingApprovals > 0 && (
                    <span style={{
                        background: '#ef4444',
                        color: 'white',
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 10,
                        marginLeft: 'auto',
                        minWidth: 18,
                        textAlign: 'center',
                        lineHeight: '16px'
                    }}>{pendingApprovals}</span>
                )}
            </NavLink>
        ))

    return (
        <div className="sidebar">
            <div className="sidebar-logo">
                <img
                    src="/multycomm_logo.png"
                    alt="MultyComm"
                    style={{ width: 36, height: 36, objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4)) brightness(1.1)' }}
                />
                <div>
                    <div className="sidebar-logo-text">TicketCRM</div>
                    <div className="sidebar-logo-sub">MultyComm Support</div>
                </div>
            </div>

            <div className="sidebar-nav">
                {/* Unified Intelligence Portals Dropdown */}
                {visibleDash.length > 0 && (
                    <>
                        <div 
                            className="nav-item parent-nav" 
                            onClick={() => setDashOpen(!dashOpen)}
                            style={{ cursor: 'pointer', marginBottom: 4 }}
                        >
                            <span className="nav-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12H3m18-6H3m18 12H3"/></svg>
                            </span>
                            <span className="nav-label" style={{ fontWeight: 800 }}>Dashboards</span>
                            <span style={{ marginLeft: 'auto', transition: 'transform 0.2s', transform: dashOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                            </span>
                        </div>
                        {dashOpen && (
                            <div className="sub-menu-container" style={{ marginBottom: 16 }}>
                                {renderItems(visibleDash, true)}
                            </div>
                        )}
                    </>
                )}

                {/* Primary Ops section */}
                {visibleNav.length > 0 && (
                    <>
                        <div className="nav-section-label">Operations</div>
                        {renderItems(visibleNav)}
                    </>
                )}

                {/* Management section */}
                {visibleMgmt.length > 0 && (
                    <>
                        <div className="nav-section-label" style={{ marginTop: 16 }}>Management</div>
                        {renderItems(visibleMgmt)}
                    </>
                )}

                {/* System section */}
                {visibleConfig.length > 0 && (
                    <>
                        <div className="nav-section-label" style={{ marginTop: 16 }}>System Config</div>
                        {renderItems(visibleConfig)}
                    </>
                )}
            </div>

            <style>{`
                .sub-nav { 
                    padding-left: 44px !important;
                    height: 38px;
                    font-size: 12px;
                    opacity: 0.85;
                }
                .sub-nav.active {
                    opacity: 1;
                    background: rgba(255,255,255,0.05);
                }
                .nav-section-label {
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    font-weight: 800;
                    color: var(--text-muted);
                    padding: 0 16px;
                    margin-bottom: 8px;
                }
                .parent-nav:hover {
                    background: rgba(255,255,255,0.03);
                }
            `}</style>

            <div className="sidebar-footer">
                <div style={{ padding: '0 12px 16px 12px' }}>
                    <PresenceToggle />
                </div>
                <div className="sidebar-user" onClick={() => { if (confirm('Logout?')) logout() }}>
                    <div className="user-avatar">{user?.name?.charAt(0)}</div>
                    <div className="user-info">
                        <div className="user-name">{user?.name}</div>
                        <div className="user-role" style={{ textTransform: 'capitalize' }}>{user?.role}</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                </div>
            </div>
        </div>
    )
}
