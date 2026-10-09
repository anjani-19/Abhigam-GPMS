import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, LogOut, User as UserIcon, QrCode } from 'lucide-react';

export default function Navbar({ user, onProfileClick }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('name');
    navigate('/login');
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'STUDENT': return 'Student';
      case 'CLASS_INCHARGE': return 'Class Incharge';
      case 'HOD': return 'Head of Dept';
      case 'PRINCIPAL': return 'Principal';
      case 'WARDEN': return 'Hostel Warden';
      case 'SECURITY': return 'Campus Security';
      case 'ADMIN': return 'Administrator';
      default: return role || 'User';
    }
  };

  return (
    <nav className="app-navbar">
      <Link to="/" className="nav-brand">
        <div className="nav-brand-icon">
          <ShieldCheck size={22} />
        </div>
        <span><strong>Anumathi</strong> <span style={{fontWeight:400, opacity:0.75, fontSize:'0.78em'}}>Your Gate, Intelligently Managed</span></span>
      </Link>

      <div className="nav-user">
        {/* Profile button — clickable for students, static badge for others */}
        {user && (
          onProfileClick ? (
            <button
              className="user-badge"
              onClick={onProfileClick}
              title="View / Edit Profile"
              style={{
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', cursor: 'pointer',
                padding: '0.35rem 0.75rem', display: 'inline-flex',
                alignItems: 'center', gap: 8, transition: 'var(--transition)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-light)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
            >
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
              }}>
                {user.name?.charAt(0)?.toUpperCase()}
              </div>
              <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-main)' }}>{user.name}</span>
              <small style={{ background: '#e0e7ff', color: '#3730a3', borderRadius: 6, padding: '1px 7px', fontSize: '0.7rem', fontWeight: 700 }}>
                {getRoleLabel(user.role)}
              </small>
            </button>
          ) : (
            <div className="user-badge">
              <UserIcon size={16} />
              <span>{user.name}</span>
              <small>{getRoleLabel(user.role)}</small>
            </div>
          )
        )}

        {user?.role === 'SECURITY' && (
          <Link to="/security" className="btn btn-secondary btn-sm">
            <QrCode size={15} />
            Gate Check
          </Link>
        )}

        <button onClick={handleLogout} className="btn btn-secondary btn-sm" title="Sign out">
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </nav>
  );
}
