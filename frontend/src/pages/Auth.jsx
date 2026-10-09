import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Mail,
  X,
  Inbox,
  Copy,
  Check,
  Zap,
  GraduationCap,
  Shield,
  KeyRound,
  Lock,
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

  // Virtual Webmail state
  const [showMailbox, setShowMailbox] = useState(false);
  const [mailboxEmail, setMailboxEmail] = useState(null);
  const [mailboxLoading, setMailboxLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (tokenParam) {
      setStep('otp');
    }
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [tokenParam, emailParam]);

  const fetchMailbox = async (targetEmail) => {
    const queryEmail = targetEmail || email;
    if (!queryEmail) return;
    try {
      setMailboxLoading(true);
      const res = await api.get('/mailbox/latest', { params: { email: queryEmail } });
      if (res.data?.found) {
        setMailboxEmail(res.data);
      }
    } catch {
      // ignore
    } finally {
      setMailboxLoading(false);
    }
  };

  useEffect(() => {
    if (step === 'otp' && email) {
      fetchMailbox(email);
    }
  }, [step, email]);

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
      const detail = err.response?.data?.detail;
      if (err.response?.status === 403 && typeof detail === 'string' && detail.toLowerCase().includes('verify')) {
        setError('Your email is not verified yet. Please enter the OTP sent to your mail ID to verify.');
        setStep('otp');
        fetchMailbox(email.trim());
      } else {
        setError(detail || 'Authentication failed. Please check your credentials.');
      }
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
    if (step === 'form') {
      const pwErr =
        password.length < 6 || password.length > 8
          ? 'Password must be 6–8 characters long.'
          : !/[a-z]/.test(password)
          ? 'Password must contain at least one lowercase letter.'
          : !/[A-Z]/.test(password)
          ? 'Password must contain at least one uppercase letter.'
          : !/\d/.test(password)
          ? 'Password must contain at least one digit (0–9).'
          : !/[\W_]/.test(password)
          ? 'Password must contain at least one special character (e.g. @#$%).'
          : null;
      if (pwErr) {
        setError(pwErr);
        setLoading(false);
        return;
      }
    }
    try {
      if (step === 'form') {
        const payload = {
          full_name: fullName,
          email,
          password,
          phone,
          student_id: role === 'STUDENT' ? studentId : null,
          employee_id: role !== 'STUDENT' ? studentId : null,
          role,
          college_id: 1,
        };
        const res = await api.post('/auth/register', payload);
        if (res.data?.access_token) {
          localStorage.setItem('token', res.data.access_token);
          localStorage.setItem('role', res.data.role);
          localStorage.setItem('name', res.data.name);
          setNotice('Account created successfully! Taking you to dashboard...');
          setTimeout(() => {
            navigate(res.data.role === 'SECURITY' ? '/security' : '/dashboard');
          }, 600);
        } else {
          setNotice('Account created successfully! Redirecting to sign in...');
          setTimeout(() => {
            navigate(`/login?email=${encodeURIComponent(email)}`);
          }, 600);
        }
      }
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
      return step === 'form' ? 'Create Account' : 'Verify Email';
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
    return 'Sign in to access JNN INSTITUTE — Anumathi';
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
                        placeholder="6–8 chars, A-z, 0-9, @#$%"
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
                      6–8 characters · uppercase · lowercase · digit · special char
                    </small>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.75rem' }} disabled={loading}>
                    {loading ? 'Processing...' : 'Continue to Verification'} <ArrowRight size={16} />
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
                  <Mail size={18} />
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

                {!tokenParam && (
                  <button
                    type="button"
                    onClick={() => {
                      fetchMailbox(email);
                      setShowMailbox(true);
                    }}
                    style={{
                      marginTop: '0.85rem',
                      background: '#1d4ed8',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '0.55rem 1rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 2px 6px rgba(29, 78, 216, 0.3)',
                      transition: 'all 0.2s',
                      width: '100%',
                    }}
                  >
                    <Inbox size={16} /> Open Webmail Inbox
                    {mailboxEmail?.otp_code ? (
                      <span style={{ background: '#93c5fd', color: '#1e3a8a', fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '9999px', fontWeight: 700 }}>
                        Code Ready
                      </span>
                    ) : null}
                  </button>
                )}
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

      {/* Floating Webmail Button */}
      <button
        type="button"
        onClick={() => {
          fetchMailbox(email);
          setShowMailbox(true);
        }}
        title="Open Webmail Inbox"
        style={{
          position: 'fixed',
          bottom: '22px',
          right: '22px',
          background: '#0f172a',
          color: '#ffffff',
          border: '1px solid #334155',
          borderRadius: '9999px',
          padding: '0.65rem 1.15rem',
          fontSize: '0.84rem',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 10px 20px -5px rgba(15, 23, 42, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          zIndex: 900,
        }}
      >
        <Mail size={16} color="#60a5fa" />
        <span>Webmail Inbox</span>
        {mailboxEmail?.otp_code && (
          <span style={{ background: '#2563eb', color: '#fff', fontSize: '0.7rem', padding: '0.1rem 0.45rem', borderRadius: '9999px', fontWeight: 700 }}>
            1
          </span>
        )}
      </button>

      {/* Webmail Modal */}
      {showMailbox && (
        <div
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
          onClick={() => setShowMailbox(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                background: '#0f172a',
                color: '#ffffff',
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ background: '#1e293b', padding: '0.4rem', borderRadius: '8px' }}>
                  <Inbox size={18} color="#60a5fa" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>JNN Institute Webmail</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Official Mailbox</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => fetchMailbox(email)}
                  disabled={mailboxLoading}
                  title="Refresh"
                  style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '0.35rem' }}
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowMailbox(false)}
                  title="Close"
                  style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '0.35rem' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Email Meta & Content */}
            <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', flex: 1, background: '#f8fafc' }}>
              {mailboxLoading ? (
                <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
                  <div>Checking mailbox...</div>
                </div>
              ) : mailboxEmail ? (
                <div>
                  {/* Meta info card */}
                  <div style={{ background: '#ffffff', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem', marginBottom: '0.35rem' }}>
                      {mailboxEmail.subject}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <div>
                        <strong style={{ color: '#475569' }}>From:</strong> {mailboxEmail.sender}
                      </div>
                      <div>
                        <strong style={{ color: '#475569' }}>To:</strong> {mailboxEmail.recipient}
                      </div>
                      <div>
                        <strong style={{ color: '#475569' }}>Date:</strong>{' '}
                        {mailboxEmail.created_at ? new Date(mailboxEmail.created_at).toLocaleString() : 'Just now'}
                      </div>
                    </div>
                  </div>

                  {/* Rendered Email Body in Frame */}
                  <div style={{ background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <iframe
                      title="Email Preview"
                      srcDoc={mailboxEmail.body_html}
                      style={{ width: '100%', height: '360px', border: 'none', display: 'block' }}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#64748b' }}>
                  <Mail size={36} color="#94a3b8" style={{ marginBottom: '0.75rem' }} />
                  <div style={{ fontWeight: 600, color: '#1e293b' }}>No Emails Yet</div>
                  <div style={{ fontSize: '0.84rem', marginTop: '0.25rem' }}>
                    When an OTP or reset code is dispatched, it will appear right here in your webmail inbox!
                  </div>
                </div>
              )}
            </div>

            {/* Modal Action Footer */}
            {mailboxEmail?.otp_code && (
              <div
                style={{
                  background: '#ffffff',
                  borderTop: '1px solid #e2e8f0',
                  padding: '0.85rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Detected Code: </span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.15rem', color: '#1d4ed8', letterSpacing: '0.1em' }}>
                    {mailboxEmail.otp_code}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setOtp(mailboxEmail.otp_code);
                    setCopiedCode(true);
                    setTimeout(() => {
                      setCopiedCode(false);
                      setShowMailbox(false);
                    }, 400);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
                >
                  {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                  {copiedCode ? 'Code Applied!' : 'Auto-Fill Code'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
