// src/pages/ResetPassword.jsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'

export default function ResetPassword() {
  const { userId, token } = useParams()
  const navigate = useNavigate()
  
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [showPwd, setShowPwd] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    setLoading(true)
    try {
      const res = await axios.post('/api/auth/reset-password', {
        userId,
        token,
        newPassword: password
      })

      if (res.data.success) {
        setSuccess(true)
        toast.success('Password reset successfully!')
        setTimeout(() => {
          navigate('/login')
        }, 3000)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password. The link may be invalid or expired.')
      toast.error('Reset failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="lp-root">
      <div className="lp-bg">
        <img src="/telecom_bg.png" alt="" className="lp-bg-img" />
        <div className="lp-bg-overlay" />
      </div>

      <div className="lp-card">
        <div className="lp-logo-wrap">
          <img src="/multycomm_logo.png" alt="MultyComm" className="lp-logo-img" />
        </div>

        <div className="lp-divider" />

        <div className="lp-heading">
          <h1 className="lp-title">Secure Your Account</h1>
          <p className="lp-subtitle">Set a new password for your Ticket CRM account</p>
        </div>

        {error && (
          <div className="lp-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        {success ? (
          <div className="reset-success-msg">
            <div className="success-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
            </div>
            <p>Your password has been updated!</p>
            <span>Redirecting to login...</span>
          </div>
        ) : (
          <form className="lp-form" onSubmit={handleSubmit}>
            <div className="lp-field">
              <label className="lp-label">New Password</label>
              <div className="lp-input-wrap">
                <svg className="lp-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  className="lp-input"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
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

            <div className="lp-field">
              <label className="lp-label">Confirm New Password</label>
              <div className="lp-input-wrap">
                <svg className="lp-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  className="lp-input"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button className="lp-btn" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="lp-spinner" />
                  Updating…
                </>
              ) : (
                <>
                  Reset Password
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lp-btn-arrow">
                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                  </svg>
                </>
              )}
            </button>
          </form>
        )}
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
          height: 80px;
          object-fit: contain;
          border-radius: 12px;
          filter: drop-shadow(0 4px 16px rgba(0,0,0,0.5)) brightness(1.05);
        }
        .lp-divider {
          height: 1px;
          background: rgba(255,255,255,0.08);
          margin-bottom: 20px;
        }
        .lp-heading { margin-bottom: 24px; text-align: center; }
        .lp-title {
          font-size: 22px;
          font-weight: 700;
          color: #f0f4ff;
          letter-spacing: -0.03em;
          margin-bottom: 4px;
        }
        .lp-subtitle { font-size: 13px; color: rgba(200,210,240,0.55); line-height: 1.4; }
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

        .reset-success-msg {
            text-align: center;
            padding: 20px 0;
            color: #f0f4ff;
            animation: fadeIn 0.4s ease-out;
        }
        .success-icon {
            color: #22c55e;
            margin-bottom: 16px;
            display: flex;
            justify-content: center;
        }
        .reset-success-msg p {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .reset-success-msg span {
            font-size: 13px;
            color: rgba(200,210,240,0.5);
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
