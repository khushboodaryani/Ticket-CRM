// src/pages/Login.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
    const { login, loading } = useAuth()
    const navigate = useNavigate()
    const [form, setForm] = useState({ email: '', password: '' })
    const [error, setError] = useState('')
    const [showPwd, setShowPwd] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        try {
            await login(form.email, form.password)
            navigate('/dashboard')
        } catch (err) {
            setError(err.response?.data?.message || 'Invalid email or password.')
        }
    }

    return (
        <div className="lp-root">
            {/* ── Full-screen background ── */}
            <div className="lp-bg">
                <img src="/telecom_bg.png" alt="" className="lp-bg-img" />
                <div className="lp-bg-overlay" />
            </div>

            {/* ── Centered card ── */}
            <div className="lp-card">
                {/* Logo */}
                <div className="lp-logo-wrap">
                    <img src="/multycomm_logo.png" alt="MultyComm" className="lp-logo-img" />
                </div>

                <div className="lp-divider" />

                <div className="lp-heading">
                    <h1 className="lp-title">Welcome back</h1>
                    <p className="lp-subtitle">Sign in to the Support CRM Platform</p>
                </div>

                {error && (
                    <div className="lp-error">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        {error}
                    </div>
                )}

                <form className="lp-form" onSubmit={handleSubmit}>
                    <div className="lp-field">
                        <label className="lp-label">Email Address</label>
                        <div className="lp-input-wrap">
                            <svg className="lp-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                            </svg>
                            <input
                                className="lp-input"
                                type="email"
                                placeholder="admin@ticketcrm.com"
                                value={form.email}
                                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                                required
                            />
                        </div>
                    </div>

                    <div className="lp-field">
                        <label className="lp-label">Password</label>
                        <div className="lp-input-wrap">
                            <svg className="lp-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <input
                                className="lp-input"
                                type={showPwd ? 'text' : 'password'}
                                placeholder="••••••••"
                                value={form.password}
                                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                                required
                            />
                            <button type="button" className="lp-pwd-toggle" onClick={() => setShowPwd(p => !p)} tabIndex={-1}>
                                {showPwd ? (
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                ) : (
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                )}
                            </button>
                        </div>
                    </div>

                    <button className="lp-btn" type="submit" disabled={loading}>
                        {loading ? (
                            <>
                                <span className="lp-spinner" />
                                Signing in…
                            </>
                        ) : (
                            <>
                                Sign In
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lp-btn-arrow">
                                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                                </svg>
                            </>
                        )}
                    </button>
                </form>

                {/* <div className="lp-creds">
                    <div className="lp-creds-label">Default credentials</div>
                    <div className="lp-creds-row"><code>admin@ticketcrm.com</code><span>/</span><code>Admin@1234</code></div>
                </div> */}
            </div>

            <style>{`
        .lp-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          padding: 24px;
          font-family: 'Inter', sans-serif;
        }
        .lp-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
        }
        .lp-bg-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
        }
        .lp-bg-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            135deg,
            rgba(5, 8, 20, 0.82) 0%,
            rgba(10, 15, 40, 0.75) 50%,
            rgba(5, 8, 20, 0.88) 100%
          );
        }
        .lp-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 430px;
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 20px;
          padding: 36px;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.04) inset,
            0 32px 80px rgba(0,0,0,0.6),
            0 8px 32px rgba(79,142,247,0.08);
          animation: lp-slide-up 0.5s cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes lp-slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .lp-logo-wrap {
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
        }
        .lp-logo-img {
          height: 72px;
          object-fit: contain;
          border-radius: 12px;
          background: rgba(255,255,255,0.9);
          padding: 8px 14px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .lp-divider {
          height: 1px;
          background: rgba(255,255,255,0.08);
          margin-bottom: 20px;
        }
        .lp-heading { margin-bottom: 24px; }
        .lp-title {
          font-size: 22px;
          font-weight: 700;
          color: #f0f4ff;
          letter-spacing: -0.03em;
          margin-bottom: 4px;
        }
        .lp-subtitle { font-size: 13px; color: rgba(200,210,240,0.55); }
        .lp-error {
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.25);
          border-radius: 9px;
          padding: 10px 14px;
          font-size: 13px;
          color: #fca5a5;
          margin-bottom: 18px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .lp-form { display: flex; flex-direction: column; gap: 16px; }
        .lp-field { display: flex; flex-direction: column; gap: 7px; }
        .lp-label { font-size: 12px; font-weight: 600; color: rgba(200,215,255,0.5); letter-spacing: 0.06em; text-transform: uppercase; }
        .lp-input-wrap { position: relative; display: flex; align-items: center; }
        .lp-input-icon { position: absolute; left: 12px; color: rgba(150,165,200,0.5); pointer-events: none; flex-shrink: 0; }
        .lp-input {
          width: 100%;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 11px 40px 11px 38px;
          font-size: 14px;
          font-family: 'Inter', sans-serif;
          color: #e8edf8;
          outline: none;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .lp-input::placeholder { color: rgba(120,135,165,0.45); }
        .lp-input:focus {
          border-color: rgba(79,142,247,0.6);
          background: rgba(255,255,255,0.08);
          box-shadow: 0 0 0 3px rgba(79,142,247,0.15);
        }
        .lp-pwd-toggle {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          color: rgba(150,165,200,0.45);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
        }
        .lp-pwd-toggle:hover { color: rgba(200,215,255,0.7); }
        .lp-btn {
          margin-top: 4px;
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #3b5bdb 0%, #4f8ef7 100%);
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 700;
          font-family: 'Inter', sans-serif;
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          letter-spacing: -0.01em;
          box-shadow: 0 6px 24px rgba(59,91,219,0.4);
          transition: transform 0.18s, box-shadow 0.18s, opacity 0.18s;
        }
        .lp-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(59,91,219,0.5);
        }
        .lp-btn:active:not(:disabled) { transform: translateY(0); }
        .lp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .lp-btn-arrow { transition: transform 0.18s; }
        .lp-btn:hover:not(:disabled) .lp-btn-arrow { transform: translateX(3px); }
        .lp-spinner {
          width: 15px; height: 15px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: lp-spin 0.7s linear infinite;
        }
        @keyframes lp-spin { to { transform: rotate(360deg); } }
        .lp-creds {
          margin-top: 22px;
          padding: 12px 14px;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px;
        }
        .lp-creds-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(150,165,200,0.4); margin-bottom: 6px; }
        .lp-creds-row { display: flex; gap: 8px; align-items: center; }
        .lp-creds-row span { color: rgba(120,135,165,0.4); font-size: 12px; }
        .lp-creds code {
          font-family: 'DM Mono', 'Courier New', monospace;
          font-size: 12px;
          color: rgba(140,165,220,0.7);
          background: rgba(255,255,255,0.04);
          padding: 2px 7px;
          border-radius: 5px;
          border: 1px solid rgba(255,255,255,0.07);
        }
      `}</style>
        </div>
    )
}