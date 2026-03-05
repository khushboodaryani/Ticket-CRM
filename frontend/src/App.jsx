// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import Layout from './components/Layout/Layout'
import ProtectedRoute from './components/Layout/ProtectedRoute'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Tickets from './pages/Tickets'
import TicketDetail from './pages/TicketDetail'
import TicketForm from './pages/TicketForm'
import STRQueue from './pages/STRQueue'
import Users from './pages/Users'
import Customers from './pages/Customers'
import Projects from './pages/Projects'
import Shifts from './pages/Shifts'
import Holidays from './pages/Holidays'

export default function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
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
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />

                        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/tickets" element={<Tickets />} />
                            <Route path="/tickets/new" element={<TicketForm />} />
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
                        </Route>
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                </BrowserRouter>
            </AuthProvider>
        </ThemeProvider>
    )
}
