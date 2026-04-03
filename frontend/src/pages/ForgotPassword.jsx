// src/pages/ForgotPassword.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await axios.post('/api/auth/forgot-password', { email })
      if (res.data.success) {
        setSuccess(true)
        toast.success(res.data.message || 'Reset link sent!')
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send reset link.')
    } finally {
      setLoading(false)
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
          <h1 className="lp-title">Forgot Password</h1>
          <p className="lp-subtitle">Enter your email to receive a password reset link</p>
        </div>

        {success ? (
          <div className="success-view">
            <div className="success-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h3>Check your email</h3>
            <p>If an account exists for {email}, you will receive a reset link shortly.</p>
            <button className="lp-btn" onClick={() => navigate('/login')}>
              Back to Login
            </button>
          </div>
        ) : (
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
                  placeholder="Enter your email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <button className="lp-btn" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="lp-spinner" />
                  Sending Link…
                </>
              ) : (
                <>
                  Send Reset Link
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lp-btn-arrow">
                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                  </svg>
                </>
              )}
            </button>

            <div className="lp-back-wrap">
              <button type="button" className="lp-back-btn" onClick={() => navigate('/login')}>
                Back to Login
              </button>
            </div>
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
          margin-bottom: 8px;
        }
        .lp-subtitle { font-size: 13px; color: rgba(200,210,240,0.55); line-height: 1.5; }
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
        .lp-input:focus {
          border-color: rgba(79,142,247,0.6);
          background: rgba(255,255,255,0.08);
          box-shadow: 0 0 0 3px rgba(79,142,247,0.15);
        }
        .lp-btn {
          margin-top: 4px;
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #3b5bdb 0%, #4f8ef7 100%);
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 700;
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 6px 24px rgba(59,91,219,0.4);
          transition: transform 0.18s, box-shadow 0.18s;
        }
        .lp-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(59,91,219,0.5);
        }
        .lp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .lp-back-wrap {
          text-align: center;
          margin-top: 12px;
        }
        .lp-back-btn {
          background: none;
          border: none;
          color: #3b82f6;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .lp-back-btn:hover { text-decoration: underline; }
        .success-view {
          text-align: center;
          color: #f0f4ff;
        }
        .success-icon {
          margin-bottom: 20px;
        }
        .success-view h3 { margin-bottom: 12px; font-size: 20px; }
        .success-view p { font-size: 14px; color: rgba(200,210,240,0.6); margin-bottom: 24px; line-height: 1.6; }
        .lp-spinner {
          width: 15px; height: 15px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: lp-spin 0.7s linear infinite;
        }
        @keyframes lp-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
