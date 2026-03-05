// src/components/Layout/Topbar.jsx
import { useTheme } from '../../context/ThemeContext'

export default function Topbar({ title, subtitle, actions }) {
    const { theme, toggleTheme } = useTheme()

    return (
        <div className="topbar">
            <div style={{ flex: 1 }}>
                <h1 className="topbar-title">{title}</h1>
                {subtitle && <p className="topbar-sub">{subtitle}</p>}
            </div>

            <div className="topbar-actions">
                {actions}
                <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
                    {theme === 'dark' ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                        </svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                        </svg>
                    )}
                </button>
            </div>

            <style>{`
        .topbar-actions { display: flex; align-items: center; gap: 12px; }
        .theme-toggle {
          width: 36px; height: 36px;
          border-radius: 50%;
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-secondary);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .theme-toggle:hover {
          background: var(--bg-card-hover);
          color: var(--accent);
          border-color: var(--accent);
          transform: rotate(15deg);
        }
      `}</style>
        </div>
    )
}
