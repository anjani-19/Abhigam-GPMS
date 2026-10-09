import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Zap,
  GraduationCap,
  Shield,
  KeyRound,
  Lock,
  Bell,
  Megaphone,
  Info,
} from 'lucide-react';
import api from '../api';

export default function Auth({ mode = 'login' }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Modes: 'login' | 'register' | 'forgot' | 'reset'
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';

  const tokenParam = searchParams.get('token') || '';
  const emailParam = searchParams.get('email') || '';

  // Steps: 'form' or 'otp'
  const [step, setStep] = useState(isReset || tokenParam ? 'otp' : 'form');
  const [email, setEmail] = useState(emailParam);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // New Password state for Reset Password
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Registration state
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState(searchParams.get('role') || 'STUDENT');

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Announcements panel state
  const [showAnnouncements, setShowAnnouncements] = useState(false);

  useEffect(() => {
    if (tokenParam) {
      setStep('otp');
    }
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [tokenParam, emailParam]);

  const validatePasswordStrength = (pw) => {
    if (!pw || pw.length < 6) return 'Password must be at least 6 characters long.';
    if (!/[a-z]/.test(pw)) return 'Password must contain at least one lowercase letter.';
    if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter.';
    if (!/\d/.test(pw)) return 'Password must contain at least one digit (0–9).';
    if (!/[\W_]/.test(pw)) return 'Password must contain at least one special character (e.g. @#$%).';
    return null;
  };

  const handleDemoLogin = async (demoEmail, label) => {
    setDemoLoading(label);
    setError('');
    try {
      const res = await api.post('/auth/demo-login', { email: demoEmail });
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('role', res.data.role);
      localStorage.setItem('name', res.data.name);
      if (res.data.role === 'SECURITY') {
        navigate('/security');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Demo login failed. Make sure the backend is running and seed.py was executed.');
    } finally {
      setDemoLoading('');
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await api.post('/auth/login', { email: email.trim(), password });
      if (res.data?.access_token) {
        localStorage.setItem('token', res.data.access_token);
        localStorage.setItem('role', res.data.role);
        localStorage.setItem('name', res.data.name);
        if (res.data.role === 'SECURITY') {
          navigate('/security');
        } else {
          navigate('/dashboard');
        }
      } else {
        setError('Unexpected response from authentication server.');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');

    // Client-side password validation
    const pwErr = validatePasswordStrength(password);
    if (pwErr) {
      setError(pwErr);
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      setLoading(false);
      return;
    }
    try {
      const payload = {
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        phone: phone.trim(),
        student_id: role === 'STUDENT' ? studentId.trim() : null,
        employee_id: role !== 'STUDENT' ? studentId.trim() : null,
        role,
        college_id: 1,
      };
      await api.post('/auth/register', payload);
      setNotice('Account created! Please sign in with your password.');
      setTimeout(() => {
        navigate(`/login?email=${encodeURIComponent(email.trim())}`);
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Please check details.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      if (step === 'form') {
        const targetEmail = email.trim();
        if (!targetEmail) {
          setError('Please provide your registered college email.');
          setLoading(false);
          return;
        }
        const res = await api.post('/auth/forgot-password', { email: targetEmail });
        if (res.data.email_delivery === 'sent') {
          setNotice(`Password reset code dispatched to ${targetEmail}. Please check your inbox.`);
        } else if (res.data.email_delivery === 'virtual') {
          setNotice(`Password recovery code generated! Check your Webmail Inbox below.`);
        } else {
          setNotice(`A 6-digit password reset code was dispatched to ${targetEmail}.`);
        }
        setOtp('');
        setStep('otp');
        fetchMailbox(targetEmail);
      } else {
        // Step === 'otp': User submitting new password
        if (!tokenParam && (!otp || otp.trim().length !== 6)) {
          setError('Please enter the 6-digit verification code.');
          setLoading(false);
          return;
        }
        const pwErr = validatePasswordStrength(newPassword);
        if (pwErr) {
          setError(pwErr);
          setLoading(false);
          return;
        }
        if (newPassword !== confirmPassword) {
          setError('Passwords do not match. Please re-enter.');
          setLoading(false);
          return;
        }

        if (tokenParam) {
          await api.post('/auth/reset-password-token', {
            email: email.trim(),
            token: tokenParam,
            new_password: newPassword,
          });
        } else {
          await api.post('/auth/reset-password', {
            email: email.trim(),
            code: otp.trim(),
            new_password: newPassword,
          });
        }

        setNotice('Password reset successfully! Redirecting to sign in...');
        setTimeout(() => {
          navigate(`/login?email=${encodeURIComponent(email.trim())}`);
        }, 1400);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not process password reset request.');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e) => {
    if (isRegister) return handleRegisterSubmit(e);
    if (isForgot || isReset) return handleForgotSubmit(e);
    return handleLoginSubmit(e);
  };

  const handleResend = async () => {
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await api.post('/auth/resend-otp', {
        email: email.trim(),
        purpose: isRegister ? 'registration' : isForgot || isReset ? 'password_reset' : 'login',
      });
      setOtp('');
      if (res.data.email_delivery === 'sent') {
        setNotice(`A fresh 6-digit verification code has been sent to ${email}. Check your inbox.`);
      } else if (res.data.email_delivery === 'virtual') {
        setNotice(`A fresh verification code was generated! Click 'Open Webmail Inbox' to view.`);
      } else {
        setNotice(`A fresh verification code has been dispatched to ${email}.`);
      }
      await fetchMailbox(email.trim());
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  const getHeaderTitle = () => {
    if (isRegister) {
      return 'Create Account';
    }
    if (isForgot || isReset) {
      return step === 'form' ? 'Forgot Password' : 'Set New Password';
    }
    return step === 'form' ? 'Welcome Back' : 'Security Verification';
  };

  const getHeaderSubtitle = () => {
    if (isRegister) {
      return 'Register for JNN INSTITUTE — Anumathi Portal';
    }
    if (isForgot || isReset) {
      return step === 'form'
        ? 'Enter your registered college email to receive a recovery code'
        : 'Enter the verification code and specify your new password';
    }
    return 'Sign in with your email and password';
  };

  const demoProfiles = [
    { email: 'student@jnn.edu.in', label: 'Student', name: 'Anjani Chowdary', icon: <GraduationCap size={18} />, color: '#2563eb' },
    { email: 'principal@jnn.edu.in', label: 'Principal', name: 'Dr. G. Mohanbabu', icon: <Shield size={18} />, color: '#7c3aed' },
    { email: 'incharge@jnn.edu.in', label: 'Class Incharge', name: 'Vijaya Lakshmi K', icon: <ShieldCheck size={18} />, color: '#0891b2' },
    { email: 'hod.aids@jnn.edu.in', label: 'HOD (AI&DS)', name: 'Dr. Nagarajan', icon: <Shield size={18} />, color: '#7c3aed' },
    { email: 'warden@jnn.edu.in', label: 'Warden', name: 'Mrs. Rama', icon: <Shield size={18} />, color: '#0d9488' },
    { email: 'security@jnn.edu.in', label: 'Security', name: 'Officer Suresh', icon: <Shield size={18} />, color: '#dc2626' },
  ];

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <Link to="/" className="logo-badge" title="Anumathi GPMS Home">
            {isForgot || isReset ? <KeyRound size={28} /> : <ShieldCheck size={28} />}
          </Link>
          <h2>{getHeaderTitle()}</h2>
          <p>{getHeaderSubtitle()}</p>
        </div>

        {/* ── Demo Quick Access (Only on standard Login Form) ── */}
        {!isRegister && !isForgot && !isReset && step === 'form' && (
          <div
            style={{
              background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
              border: '1.5px solid #bfdbfe',
              borderRadius: '14px',
              padding: '1rem',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.75rem' }}>
              <Zap size={15} color="#f59e0b" fill="#f59e0b" />
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Quick Demo Access
              </span>
              <span style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: 'auto' }}>No password needed</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {demoProfiles.map(({ email: demoMail, label, name, icon, color }) => (
                <button
                  key={demoMail}
                  type="button"
                  onClick={() => handleDemoLogin(demoMail, label)}
                  disabled={!!demoLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.6rem 0.75rem',
                    background: '#ffffff',
                    border: `1.5px solid ${color}22`,
                    borderRadius: '10px',
                    cursor: demoLoading ? 'not-allowed' : 'pointer',
                    opacity: demoLoading && demoLoading !== label ? 0.55 : 1,
                    transition: 'all 0.18s',
                    textAlign: 'left',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = color;
                    e.currentTarget.style.boxShadow = `0 3px 8px ${color}30`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = `${color}22`;
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                  }}
                >
                  <span style={{ background: `${color}15`, borderRadius: '8px', padding: '0.3rem', color, flexShrink: 0, display: 'flex' }}>
                    {icon}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>
                      {demoLoading === label ? 'Opening…' : label}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {name}
                    </div>
                  </span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: '0.65rem', fontSize: '0.68rem', color: '#94a3b8', textAlign: 'center' }}>
              These are seeded demo accounts — opens dashboard instantly
            </div>
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="alert alert-info">
            <CheckCircle2 size={18} />
            <span>{notice}</span>
          </div>
        )}

        <form onSubmit={handleFormSubmit}>
          {step === 'form' ? (
            <>
              {isForgot ? (
                <>
                  <div className="form-group">
                    <label>College Email Address</label>
                    <input
                      type="email"
                      className="form-control"
                      placeholder="e.g. student@jnn.edu.in"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                    <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.35rem', display: 'block' }}>
                      Enter your official JNN Institute email. We will send a 6-digit recovery code.
                    </small>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.75rem' }} disabled={loading}>
                    {loading ? 'Sending Code...' : 'Send Recovery Code'} <ArrowRight size={16} />
                  </button>
                </>
              ) : isRegister ? (
                <>
                  <div className="form-group">
                    <label>Full Name</label>
                    <input
                      className="form-control"
                      placeholder="e.g. Anjani Chowdary"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Account Role</label>
                    <select className="form-control" value={role} onChange={(e) => setRole(e.target.value)}>
                      <option value="STUDENT">Student</option>
                      <option value="CLASS_INCHARGE">Class Incharge</option>
                      <option value="HOD">Head of Department (HOD)</option>
                      <option value="WARDEN">Hostel Warden</option>
                      <option value="SECURITY">Campus Security</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>{role === 'STUDENT' ? 'Roll Number / Student ID' : 'Employee ID'}</label>
                    <input
                      className="form-control"
                      placeholder={role === 'STUDENT' ? 'e.g. 110723102021' : 'e.g. EMP-104'}
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Mobile Number</label>
                    <input
                      className="form-control"
                      placeholder="10-digit phone number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      className="form-control"
                      placeholder="name@jnn.edu.in"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="password-input"
                        type={showPassword ? 'text' : 'password'}
                        className="form-control"
                        placeholder="At least 6 chars, uppercase, lowercase, digit, symbol"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        style={{ paddingRight: '2.8rem' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: '0.75rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#64748b',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          padding: 0,
                        }}
                        tabIndex={-1}
                      >
                        {showPassword ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                    <small style={{ color: '#94a3b8', fontSize: '0.72rem', marginTop: '0.3rem', display: 'block' }}>
                      At least 6 characters · uppercase · lowercase · digit · special char
                    </small>
                  </div>

                  <div className="form-group">
                    <label>Confirm Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="confirm-password-input"
                        type={showConfirmPassword ? 'text' : 'password'}
                        className="form-control"
                        placeholder="Re-enter your password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        style={{
                          paddingRight: '2.8rem',
                          borderColor: confirmPassword && confirmPassword !== password ? '#ef4444' : undefined,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={{
                          position: 'absolute',
                          right: '0.75rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#64748b',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          padding: 0,
                        }}
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                    {confirmPassword && confirmPassword !== password && (
                      <small style={{ color: '#ef4444', fontSize: '0.72rem', marginTop: '0.25rem', display: 'block' }}>
                        Passwords do not match
                      </small>
                    )}
                    {confirmPassword && confirmPassword === password && (
                      <small style={{ color: '#16a34a', fontSize: '0.72rem', marginTop: '0.25rem', display: 'block' }}>
                        ✓ Passwords match
                      </small>
                    )}
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.75rem' }} disabled={loading}>
                    {loading ? 'Creating Account...' : 'Create Account'} <ArrowRight size={16} />
                  </button>
                </>
              ) : (
                /* Standard Login Form */
                <>
                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      className="form-control"
                      placeholder="name@jnn.edu.in"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <label style={{ margin: 0 }}>Password</label>
                      <Link
                        to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}
                        style={{ fontSize: '0.78rem', color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                      >
                        Forgot Password?
                      </Link>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="password-input"
                        type={showPassword ? 'text' : 'password'}
                        className="form-control"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        style={{ paddingRight: '2.8rem' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: '0.75rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#64748b',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          padding: 0,
                        }}
                        tabIndex={-1}
                      >
                        {showPassword ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.75rem' }} disabled={loading}>
                    {loading ? 'Processing...' : 'Sign In'} <ArrowRight size={16} />
                  </button>
                </>
              )}
            </>
          ) : (
            /* ── Step: OTP / Reset Password Form ── */
            <>
              <div
                style={{
                  textAlign: 'center',
                  marginBottom: '1.5rem',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '12px',
                  padding: '1.1rem',
                }}
              >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#1d4ed8', fontWeight: 600, marginBottom: '0.25rem' }}>
                  <RefreshCw size={18} />
                  <span>Check Your Email</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                  {tokenParam
                    ? 'Reset token loaded from your verification link for:'
                    : isForgot || isReset
                    ? 'We dispatched a 6-digit recovery code to:'
                    : 'We sent a 6-digit verification code to:'}
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginTop: '0.25rem', wordBreak: 'break-all' }}>
                  {email || 'Your Registered Email'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Open your email client and check your inbox for the code.
                </div>
              </div>

              {/* Forgot / Reset Password Inputs */}
              {isForgot || isReset ? (
                <>
                  {!tokenParam && (
                    <div className="form-group">
                      <label>6-Digit Verification Code</label>
                      <input
                        className="form-control"
                        style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.25em', fontFamily: 'monospace' }}
                        maxLength="6"
                        placeholder="••••••"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label>New Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        className="form-control"
                        placeholder="At least 6 chars, uppercase, lowercase, digit, symbol"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        style={{ paddingRight: '2.8rem' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        style={{
                          position: 'absolute',
                          right: '0.75rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#64748b',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          padding: 0,
                        }}
                        tabIndex={-1}
                      >
                        {showNewPassword ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Confirm New Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        className="form-control"
                        placeholder="Re-type new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        style={{
                          paddingRight: '2.8rem',
                          borderColor: confirmPassword && confirmPassword !== newPassword ? '#ef4444' : undefined,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={{
                          position: 'absolute',
                          right: '0.75rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#64748b',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          padding: 0,
                        }}
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                    {confirmPassword && confirmPassword !== newPassword && (
                      <small style={{ color: '#ef4444', fontSize: '0.72rem', marginTop: '0.25rem', display: 'block' }}>
                        Passwords do not match
                      </small>
                    )}
                    {confirmPassword && confirmPassword === newPassword && (
                      <small style={{ color: '#16a34a', fontSize: '0.72rem', marginTop: '0.25rem', display: 'block' }}>
                        ✓ Passwords match
                      </small>
                    )}
                    <small style={{ color: '#94a3b8', fontSize: '0.72rem', marginTop: '0.3rem', display: 'block' }}>
                      At least 6 characters · uppercase · lowercase · digit · special character
                    </small>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.75rem' }} disabled={loading}>
                    {loading ? 'Resetting Password...' : 'Reset Password & Sign In'} <ArrowRight size={16} />
                  </button>
                </>
              ) : (
                /* Regular Login / Register OTP Step */
                <>
                  <div className="form-group">
                    <label>6-Digit Verification Code</label>
                    <input
                      className="form-control"
                      style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.25em', fontFamily: 'monospace' }}
                      maxLength="6"
                      placeholder="••••••"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.75rem' }} disabled={loading}>
                    {loading ? 'Verifying...' : 'Verify & Continue'} <ArrowRight size={16} />
                  </button>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    if (isReset) {
                      navigate('/login');
                    } else {
                      setStep('form');
                    }
                  }}
                >
                  ← Back
                </button>
                {!tokenParam && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleResend} disabled={loading}>
                    <RefreshCw size={14} /> Resend OTP
                  </button>
                )}
              </div>
            </>
          )}
        </form>

        <div
          style={{
            textAlign: 'center',
            marginTop: '1.75rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid var(--border)',
            fontSize: '0.88rem',
            color: 'var(--text-muted)',
          }}
        >
          {isForgot || isReset ? (
            <span>
              Remembered your password?{' '}
              <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                Sign In
              </Link>
            </span>
          ) : isRegister ? (
            <span>
              Already have an account?{' '}
              <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                Sign In
              </Link>
            </span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'center' }}>
              <span>
                Need an account?{' '}
                <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                  Register now
                </Link>
              </span>
              <span>
                Forgot your password?{' '}
                <Link to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>
                  Reset here
                </Link>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Floating Announcements Button */}
      <button
        type="button"
        id="announcements-toggle-btn"
        onClick={() => setShowAnnouncements(true)}
        title="View Announcements"
        style={{
          position: 'fixed',
          bottom: '22px',
          right: '22px',
          background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
          color: '#ffffff',
          border: 'none',
          borderRadius: '9999px',
          padding: '0.65rem 1.15rem',
          fontSize: '0.84rem',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 10px 20px -5px rgba(79, 70, 229, 0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          zIndex: 900,
          transition: 'transform 0.18s, box-shadow 0.18s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 14px 28px -6px rgba(79, 70, 229, 0.6)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 10px 20px -5px rgba(79, 70, 229, 0.5)';
        }}
      >
        <Bell size={16} />
        <span>Announcements</span>
        <span style={{
          background: '#f59e0b',
          color: '#1c1917',
          fontSize: '0.68rem',
          padding: '0.1rem 0.4rem',
          borderRadius: '9999px',
          fontWeight: 800,
          lineHeight: 1.4,
        }}>3</span>
      </button>

      {/* Announcements Modal */}
      {showAnnouncements && (
        <div
          id="announcements-modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setShowAnnouncements(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '18px',
              maxWidth: '520px',
              width: '100%',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.3)',
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
              color: '#ffffff',
              padding: '1.1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.15)', padding: '0.4rem', borderRadius: '10px', display: 'flex' }}>
                  <Megaphone size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>Institute Announcements</div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)' }}>JNN Institute — Official Notices</div>
                </div>
              </div>
              <button
                type="button"
                id="announcements-close-btn"
                onClick={() => setShowAnnouncements(false)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '0.4rem', borderRadius: '8px', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Announcements List */}
            <div style={{ padding: '1rem 1.1rem', overflowY: 'auto', flex: 1, background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {[
                {
                  id: 1,
                  tag: 'Important',
                  tagColor: '#dc2626',
                  tagBg: '#fef2f2',
                  title: 'Gate Pass System Now Active',
                  body: 'The Anumathi digital gate pass system is now fully operational. All students must use the portal to request and obtain gate passes. Physical passes are no longer accepted.',
                  date: 'Oct 9, 2026',
                  icon: <ShieldCheck size={16} color="#dc2626" />,
                },
                {
                  id: 2,
                  tag: 'Notice',
                  tagColor: '#d97706',
                  tagBg: '#fffbeb',
                  title: 'Gate Pass Submission Timings',
                  body: 'Gate pass requests must be submitted at least 2 hours before the intended exit time. Late requests may not be approved. Plan ahead and submit early.',
                  date: 'Oct 8, 2026',
                  icon: <Info size={16} color="#d97706" />,
                },
                {
                  id: 3,
                  tag: 'Info',
                  tagColor: '#2563eb',
                  tagBg: '#eff6ff',
                  title: 'New Students: Register Your Account',
                  body: 'First-year students can now create their portal accounts. Use your official JNN Institute email and roll number to register. Contact your class incharge if you face any issues.',
                  date: 'Oct 7, 2026',
                  icon: <GraduationCap size={16} color="#2563eb" />,
                },
              ].map((ann) => (
                <div
                  key={ann.id}
                  style={{
                    background: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    padding: '0.95rem 1rem',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    transition: 'box-shadow 0.18s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.09)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                    <div style={{ background: ann.tagBg, borderRadius: '8px', padding: '0.4rem', flexShrink: 0, marginTop: '0.05rem', display: 'flex' }}>
                      {ann.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          color: ann.tagColor,
                          background: ann.tagBg,
                          padding: '0.1rem 0.5rem',
                          borderRadius: '9999px',
                          border: `1px solid ${ann.tagColor}30`,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}>{ann.tag}</span>
                        <span style={{ fontSize: '0.71rem', color: '#94a3b8', marginLeft: 'auto' }}>{ann.date}</span>
                      </div>
                      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem', marginBottom: '0.35rem', lineHeight: 1.35 }}>
                        {ann.title}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.6 }}>
                        {ann.body}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{
              borderTop: '1px solid #e2e8f0',
              padding: '0.8rem 1.25rem',
              background: '#ffffff',
              textAlign: 'center',
              fontSize: '0.76rem',
              color: '#94a3b8',
            }}>
              For queries, contact your Class Incharge or the Administration Office.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
