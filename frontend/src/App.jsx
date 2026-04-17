// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { SocketProvider } from './context/SocketContext'
import Layout from './components/Layout/Layout'
import ProtectedRoute from './components/Layout/ProtectedRoute'

import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword.jsx'
import Dashboard from './pages/Dashboard'
import Tickets from './pages/Tickets'
import TicketDetail from './pages/TicketDetail'
import TicketForm from './pages/TicketForm'
import BulkImport from './pages/BulkImport'
import STRQueue from './pages/STRQueue'
import Users from './pages/Users'
import Customers from './pages/Customers'
import Projects from './pages/Projects'
import Shifts from './pages/Shifts'
import Holidays from './pages/Holidays'
import Queues from './pages/Queues'
import WorkflowBuilder from './pages/WorkflowBuilder'
import Analytics from './pages/Analytics'
import SlaSettings from './pages/SlaSettings'
import DomainApprovals from './pages/DomainApprovals'
import ResetPassword from './pages/ResetPassword'

// Monitoring Dashboard Suite
import QueuesDashboard from './pages/Monitoring/QueuesDashboard'
import AgentsDashboard from './pages/Monitoring/AgentsDashboard'
import CommandCenter from './pages/Monitoring/CommandCenter'

// Operation Portals (Full Page)
import AgentPortalPage from './pages/Monitoring/AgentPortalPage'
import QueuePortalPage from './pages/Monitoring/QueuePortalPage'
import ShiftPortalPage from './pages/Monitoring/ShiftPortalPage'


export default function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <SocketProvider>
                    <BrowserRouter>
                        <Toaster
                            position="top-right"
                            toastOptions={{
                                style: {
                                    background: 'var(--bg-card)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '10px',
                                    fontSize: '13px',
                                },
                                success: { iconTheme: { primary: '#22c55e', secondary: 'var(--bg-card)' } },
                                error: { iconTheme: { primary: '#ef4444', secondary: 'var(--bg-card)' } },
                            }}
                        />
                        <Routes>
                            <Route path="/login" element={<Login />} />
                            <Route path="/forgot-password" element={<ForgotPassword />} />
                            <Route path="/reset-password/:userId/:token" element={<ResetPassword />} />
                            <Route path="/" element={<Navigate to="/dashboard" replace />} />

                            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                                <Route path="/dashboard" element={<Dashboard />} />
                                <Route path="/tickets" element={<Tickets />} />
                                <Route path="/tickets/new" element={<TicketForm />} />
                                <Route path="/tickets/import" element={
                                    <ProtectedRoute roles={['superadmin', 'gm', 'manager']}><BulkImport /></ProtectedRoute>
                                } />
                                <Route path="/tickets/queue" element={
                                    <ProtectedRoute roles={['superadmin', 'gm', 'manager', 'tl']}><STRQueue /></ProtectedRoute>
                                } />
                                <Route path="/tickets/:id" element={<TicketDetail />} />
                                <Route path="/customers" element={<Customers />} />
                                <Route path="/projects" element={<Projects />} />
                                <Route path="/users" element={
                                    <ProtectedRoute roles={['superadmin', 'gm', 'manager']}><Users /></ProtectedRoute>
                                } />
                                <Route path="/shifts" element={
                                    <ProtectedRoute roles={['superadmin', 'gm', 'manager']}><Shifts /></ProtectedRoute>
                                } />
                                <Route path="/holidays" element={
                                    <ProtectedRoute roles={['superadmin']}><Holidays /></ProtectedRoute>
                                } />
                                <Route path="/queues" element={
                                    <ProtectedRoute roles={['superadmin', 'gm', 'manager']}><Queues /></ProtectedRoute>
                                } />
                                <Route path="/workflows" element={
                                    <ProtectedRoute roles={['superadmin', 'gm', 'manager']}><WorkflowBuilder /></ProtectedRoute>
                                } />
                                <Route path="/sla" element={
                                    <ProtectedRoute roles={['superadmin', 'manager']}><SlaSettings /></ProtectedRoute>
                                } />
                                <Route path="/analytics" element={
                                    <ProtectedRoute roles={['superadmin', 'gm', 'manager']}><Analytics /></ProtectedRoute>
                                } />
                                <Route path="/approvals/domains" element={
                                    <ProtectedRoute roles={['superadmin']}><DomainApprovals /></ProtectedRoute>
                                } />

                                <Route path="/monitoring/queues" element={
                                    <ProtectedRoute roles={['superadmin', 'gm', 'manager']}><QueuesDashboard /></ProtectedRoute>
                                } />
                                <Route path="/monitoring/agents" element={
                                    <ProtectedRoute roles={['superadmin', 'gm', 'manager']}><AgentsDashboard /></ProtectedRoute>
                                } />
                                <Route path="/monitoring/command-center" element={
                                    <ProtectedRoute roles={['superadmin', 'gm', 'manager']}><CommandCenter /></ProtectedRoute>
                                } />

                                {/* Full Page Portals */}
                                <Route path="/monitoring/agent/:id" element={
                                    <ProtectedRoute roles={['superadmin', 'gm', 'manager', 'tl']}><AgentPortalPage /></ProtectedRoute>
                                } />
                                <Route path="/monitoring/queue/:id" element={
                                    <ProtectedRoute roles={['superadmin', 'gm', 'manager', 'tl']}><QueuePortalPage /></ProtectedRoute>
                                } />
                                <Route path="/monitoring/shift/:id" element={
                                    <ProtectedRoute roles={['superadmin', 'gm', 'manager', 'tl']}><ShiftPortalPage /></ProtectedRoute>
                                } />

                            </Route>
                            <Route path="*" element={<Navigate to="/dashboard" replace />} />
                        </Routes>
                    </BrowserRouter>
                </SocketProvider>
            </AuthProvider>
        </ThemeProvider>
    )
}
