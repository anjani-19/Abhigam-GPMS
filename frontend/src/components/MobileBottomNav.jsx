import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, PlusCircle, ShieldCheck, User, LogOut, ScanLine } from 'lucide-react';

export default function MobileBottomNav({ onOpenNewPass, onOpenProfile }) {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token) return null;

  const isSecurity = role === 'SECURITY';
  const isStudent = role === 'STUDENT';
  const isDashboard = location.pathname === '/dashboard';
  const isSecurityPage = location.pathname === '/security';

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  return (
    <nav className="mobile-bottom-nav">
      <button
        className={`nav-item ${isDashboard && !isSecurityPage ? 'active' : ''}`}
        onClick={() => navigate('/dashboard')}
      >
        <Home size={20} />
        <span>Home</span>
      </button>

      {isStudent && (
        <button
          className="nav-item nav-item-primary"
          onClick={() => {
            if (onOpenNewPass) {
              onOpenNewPass();
            } else {
              navigate('/dashboard');
            }
          }}
        >
          <PlusCircle size={22} />
          <span>Apply</span>
        </button>
      )}

      {isSecurity && (
        <button
          className={`nav-item nav-item-primary ${isSecurityPage ? 'active' : ''}`}
          onClick={() => navigate('/security')}
        >
          <ScanLine size={22} />
          <span>Scanner</span>
        </button>
      )}

      {onOpenProfile && (
        <button className="nav-item" onClick={onOpenProfile}>
          <User size={20} />
          <span>Profile</span>
        </button>
      )}

      <button className="nav-item" onClick={handleLogout}>
        <LogOut size={20} />
        <span>Logout</span>
      </button>
    </nav>
  );
}
