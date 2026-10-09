import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import './style.css';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import StudentDashboard from './pages/StudentDashboard';
import StaffDashboard from './pages/StaffDashboard';
import HODDashboard from './pages/HODDashboard';
import SecurityGate from './pages/SecurityGate';

function ProtectedRoute({ children, allowedRoles }) {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function DashboardDispatcher() {
  const role = localStorage.getItem('role');
  if (role === 'STUDENT') {
    return <StudentDashboard />;
  }
  if (role === 'SECURITY') {
    return <SecurityGate />;
  }
  if (role === 'HOD') {
    return <HODDashboard />;
  }
  return <StaffDashboard />;
}

function EmailVerificationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const status = params.get('status');
  const isVerified = status === 'verified';

  return (
    <div className="auth-wrapper">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <h2>{isVerified ? 'Email Verified Successfully' : 'Verification Link Status'}</h2>
        <p style={{ marginTop: '0.75rem', color: '#64748b' }}>
          {isVerified
            ? 'Your official college email has been verified. You can now sign in to your gate-pass account.'
            : 'The verification link is invalid, expired, or has already been used.'}
        </p>
        <button
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '1.75rem' }}
          onClick={() => navigate('/login')}
        >
          Continue to Sign In
        </button>
      </div>
    </div>
  );
}

import InstallAppPrompt from './components/InstallAppPrompt';

// Register Service Worker for Mobile PWA
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Ignore in development or unsupported environments
    });
  });
} else if ('serviceWorker' in navigator) {
  // Also register in dev mode if supported for test installation
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function App() {
  return (
    <BrowserRouter>
      <InstallAppPrompt />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/register" element={<Auth mode="register" />} />
        <Route path="/forgot-password" element={<Auth mode="forgot" />} />
        <Route path="/reset-password" element={<Auth mode="reset" />} />
        <Route path="/verify-email" element={<EmailVerificationPage />} />

        {/* Dashboard route automatically directs to StudentDashboard, StaffDashboard, or SecurityGate */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardDispatcher />
            </ProtectedRoute>
          }
        />

        <Route
          path="/security"
          element={
            <ProtectedRoute allowedRoles={['SECURITY', 'ADMIN', 'PRINCIPAL']}>
              <SecurityGate />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<App />);
