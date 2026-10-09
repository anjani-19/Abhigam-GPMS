import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, GraduationCap, Users, QrCode, ArrowRight,
  CheckCircle2, Lock, Clock, FileCheck, Zap, Shield,
  BarChart3, KeyRound, ScanLine, BadgeCheck, GitBranch,
  Building2, Send,
} from 'lucide-react';
import api from '../api';

const STEPS = [
  { icon: FileCheck, label: 'Student Submits Request', desc: 'Fill reason, exit & return time', color: '#6366f1' },
  { icon: Users, label: 'Class Incharge Reviews', desc: 'Faculty approves or rejects', color: '#0ea5e9' },
  { icon: Shield, label: 'Principal Authorizes', desc: 'Final institutional approval', color: '#8b5cf6' },
  { icon: QrCode, label: 'QR Pass Issued', desc: 'Encrypted token generated', color: '#10b981' },
  { icon: CheckCircle2, label: 'Gate Scan & Exit', desc: 'Security verifies at gate', color: '#f59e0b' },
];

const STATS = [
  { value: '10+', label: 'Departments', icon: GraduationCap },
  { value: '5-Step', label: 'Approval Flow', icon: GitBranch },
  { value: '100%', label: 'Paperless', icon: Zap },
  { value: '24/7', label: 'Live Logs', icon: BarChart3 },
];

const SECURITY_HIGHLIGHTS = [
  { icon: KeyRound, title: 'SHA-256 OTP', desc: 'Time-limited one-time passwords' },
  { icon: ScanLine, title: 'Encrypted QR', desc: 'Dynamic tokens, not static codes' },
  { icon: BadgeCheck, title: 'Multi-tier Auth', desc: 'Incharge → Principal chain' },
  { icon: ShieldCheck, title: 'Gate Audit Log', desc: 'Every exit & return recorded' },
];

export default function Landing() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [loginLoading, setLoginLoading] = useState(null);

  // College inquiry form state
  const [showInquiry, setShowInquiry] = useState(false);
  const [inquiryForm, setInquiryForm] = useState({ college_name: '', contact_name: '', contact_email: '', contact_phone: '', city: '', message: '' });
  const [inquiryLoading, setInquiryLoading] = useState(false);
  const [inquiryResult, setInquiryResult] = useState(null);
  const [inquiryError, setInquiryError] = useState('');

  const handleInquirySubmit = async (e) => {
    e.preventDefault();
    setInquiryLoading(true);
    setInquiryError('');
    setInquiryResult(null);
    try {
      const res = await api.post('/college-requests', inquiryForm);
      setInquiryResult(res.data.message);
      setInquiryForm({ college_name: '', contact_name: '', contact_email: '', contact_phone: '', city: '', message: '' });
    } catch (err) {
      setInquiryError(err.response?.data?.detail || 'Something went wrong. Please try again.');
    } finally {
      setInquiryLoading(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % STEPS.length);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  const handleQuickLogin = async (email, role) => {
    setLoginLoading(role);
    try {
      const res = await api.post('/auth/login', { email, password: 'DemoPass123!' });
      if (res.data?.access_token) {
        localStorage.setItem('token', res.data.access_token);
        localStorage.setItem('role', res.data.role);
        localStorage.setItem('name', res.data.name);
        navigate(res.data.role === 'SECURITY' ? '/security' : '/dashboard');
      } else {
        navigate(`/login?email=${encodeURIComponent(email)}`);
      }
    } catch {
      navigate(`/login?email=${encodeURIComponent(email)}`);
    } finally {
      setLoginLoading(null);
    }
  };

  return (
    <div className="landing-hero">
      <div className="landing-blob landing-blob-1" />
      <div className="landing-blob landing-blob-2" />
      <div className="landing-blob landing-blob-3" />

      {/* ── Navbar ── */}
      <header className="landing-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="nav-brand-icon"><ShieldCheck size={22} /></div>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              JNN INSTITUTE OF ENGINEERING
            </div>
            <div style={{ fontSize: '0.63rem', fontWeight: 600, color: '#93c5fd', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Anumathi — Your Gate, Intelligently Managed
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/login" className="btn btn-secondary btn-sm"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', borderColor: 'rgba(255,255,255,0.18)' }}>
            Sign In
          </Link>
          <Link to="/register" className="btn btn-primary btn-sm">
            Get Started <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {/* ── Two-column layout ── */}
      <main className="landing-two-col">

        {/* LEFT — Hero content */}
        <div className="landing-left">

          {/* Badge pill */}
          <div className="landing-pill">
            <ShieldCheck size={13} />
            JNN INSTITUTE OF ENGINEERING — CAMPUS MOBILITY PLATFORM
          </div>

          {/* Headline */}
          <h1>
            Anumathi<br />
            <span className="gradient-text">Your Gate, Intelligently Managed</span>
          </h1>

          {/* Sub text */}
          <p className="landing-lead">
            Automated multi-stage approvals, encrypted QR issuance, and real-time
            gate scan logging — built exclusively for JNN Institute of Engineering.
          </p>

          {/* CTA buttons */}
          <div className="landing-cta-row">
            <Link to="/register" className="btn btn-primary" style={{ fontSize: '0.95rem', padding: '0.7rem 1.6rem' }}>
              Get Your Anumathi Pass <ArrowRight size={16} />
            </Link>
            <Link to="/login" className="btn btn-ghost-white">
              Staff / HOD Login
            </Link>
          </div>

          {/* Role cards */}
          <div className="role-cards-grid">
            <Link to="/register" className="role-card">
              <div className="role-card-icon"><GraduationCap size={20} /></div>
              <strong>Students</strong>
              <p>Submit requests & get QR pass instantly.</p>
            </Link>
            <Link to="/login" className="role-card">
              <div className="role-card-icon"><Users size={20} /></div>
              <strong>Faculty & HOD</strong>
              <p>Review, approve or reject passes.</p>
            </Link>
            <Link to="/security" className="role-card">
              <div className="role-card-icon"><QrCode size={20} /></div>
              <strong>Gate Security</strong>
              <p>Scan & verify QR passes in real-time.</p>
            </Link>
          </div>

          {/* Quick demo strip */}
          <div className="demo-accounts-strip">
            <h4>⚡ One-Click Demo Access</h4>
            <div className="demo-buttons-row">
              {[
                { label: 'Student: Anjani', email: 'student@jnn.edu.in', role: 'STUDENT' },
                { label: 'Class Incharge', email: 'incharge@jnn.edu.in', role: 'CLASS_INCHARGE' },
                { label: 'HOD: Dr. Nagarajan', email: 'hod.aids@jnn.edu.in', role: 'HOD' },
                { label: 'Principal: Dr. G. Mohanbabu', email: 'principal@jnn.edu.in', role: 'PRINCIPAL' },
                { label: 'Warden', email: 'warden@jnn.edu.in', role: 'WARDEN' },
                { label: 'Security', email: 'security@jnn.edu.in', role: 'SECURITY' },
              ].map((d) => (
                <button
                  key={d.role}
                  className="btn-demo-quick"
                  onClick={() => handleQuickLogin(d.email, d.role)}
                  disabled={loginLoading !== null}
                  style={{ opacity: loginLoading && loginLoading !== d.role ? 0.45 : 1 }}
                >
                  {loginLoading === d.role ? '●●●' : d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — Info panel */}
        <div className="landing-right">

          {/* Institute card */}
          <div className="right-institute-card">
            <div className="right-institute-logo"><ShieldCheck size={32} strokeWidth={1.5} /></div>
            <div>
              <div className="right-institute-name">JNN Institute of Engineering</div>
              <div className="right-institute-sub">Anumathi — Your Gate, Intelligently Managed</div>
            </div>
          </div>

          {/* Stats */}
          <div className="right-stats-grid">
            {STATS.map((s) => (
              <div key={s.label} className="right-stat-card">
                <s.icon size={17} strokeWidth={1.8} className="right-stat-icon" />
                <div className="right-stat-value">{s.value}</div>
                <div className="right-stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Animated workflow stepper */}
          <div className="right-workflow-card">
            <div className="right-workflow-header">
              <Clock size={15} style={{ color: '#93c5fd' }} />
              <span>Anumathi Workflow</span>
              <span className="right-workflow-live">● LIVE</span>
            </div>
            <div className="right-steps">
              {STEPS.map((step, i) => {
                const isActive = i === activeStep;
                const isDone = i < activeStep;
                return (
                  <div key={i} className={`right-step ${isActive ? 'step-active' : ''} ${isDone ? 'step-done' : ''}`}>
                    {/* Step number badge */}
                    <div className="right-step-num" style={{
                      background: isDone ? '#10b981' : isActive ? step.color : 'rgba(255,255,255,0.08)',
                      color: isDone || isActive ? '#fff' : '#475569',
                      borderColor: isActive ? step.color : isDone ? '#10b981' : 'rgba(255,255,255,0.12)',
                    }}>
                      {isDone ? <CheckCircle2 size={13} /> : <span>{i + 1}</span>}
                    </div>
                    {/* Icon */}
                    <div className="right-step-icon-wrap" style={{
                      borderColor: isActive ? step.color : isDone ? '#10b981' : 'rgba(255,255,255,0.12)',
                      background: isActive ? step.color + '22' : isDone ? '#10b98118' : 'transparent',
                    }}>
                      <step.icon size={15} style={{ color: isActive ? step.color : isDone ? '#10b981' : '#475569' }} />
                    </div>
                    <div className="right-step-text">
                      <div className="right-step-label" style={{ color: isActive ? '#fff' : isDone ? '#86efac' : '#64748b' }}>
                        {step.label}
                      </div>
                      <div className="right-step-desc">{step.desc}</div>
                    </div>
                    {isActive && <div className="right-step-pulse" style={{ background: step.color }} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Security highlights — replaces loose pills */}
          <div className="right-security-grid">
            {SECURITY_HIGHLIGHTS.map((h) => (
              <div key={h.title} className="right-security-card">
                <div className="right-security-icon"><h.icon size={16} /></div>
                <div>
                  <div className="right-security-title">{h.title}</div>
                  <div className="right-security-desc">{h.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── College Onboarding Section ── */}
      <section className="college-inquiry-section" id="college-access">
        <div className="college-inquiry-inner">
          <div className="college-inquiry-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', borderRadius: 10, padding: 8, display: 'flex' }}>
                <Building2 size={22} color="#fff" />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#fff' }}>Your College Can Join Too</h2>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.92rem', lineHeight: 1.7, marginBottom: 20 }}>
              Anumathi is not limited to a single institution. Any college can adopt our intelligent gate pass
              system. Just fill in your details — our admin will review your request and send you login credentials
              within 24 hours.
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Submit Request', desc: 'Fill the form with your college details' },
                { label: 'Admin Reviews', desc: 'Our team verifies and approves' },
                { label: 'Get Credentials', desc: 'Receive your admin login via email' },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ background: '#6366f1', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                  <div>
                    <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.82rem' }}>{s.label}</div>
                    <div style={{ color: '#64748b', fontSize: '0.72rem' }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="college-inquiry-form-card">
            {inquiryResult ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <CheckCircle2 size={48} color="#10b981" style={{ marginBottom: 12 }} />
                <h3 style={{ color: '#10b981', margin: '0 0 8px', fontSize: '1.1rem' }}>Request Submitted!</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.88rem', lineHeight: 1.6 }}>{inquiryResult}</p>
                <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => { setInquiryResult(null); setShowInquiry(false); }}>Close</button>
              </div>
            ) : (
              <form onSubmit={handleInquirySubmit}>
                <h3 style={{ margin: '0 0 16px', fontWeight: 700, color: '#e2e8f0', fontSize: '1rem' }}>
                  <Send size={15} style={{ marginRight: 6, verticalAlign: -2 }} /> Request College Access
                </h3>
                {inquiryError && <div className="alert alert-error" style={{ marginBottom: 12, fontSize: '0.82rem' }}><AlertCircle size={14} /> {inquiryError}</div>}
                <div style={{ display: 'grid', gap: 10 }}>
                  <input className="form-input" placeholder="College / Institution Name *" required value={inquiryForm.college_name} onChange={e => setInquiryForm({ ...inquiryForm, college_name: e.target.value })} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input className="form-input" placeholder="Your Full Name *" required value={inquiryForm.contact_name} onChange={e => setInquiryForm({ ...inquiryForm, contact_name: e.target.value })} />
                    <input className="form-input" type="email" placeholder="Official Email *" required value={inquiryForm.contact_email} onChange={e => setInquiryForm({ ...inquiryForm, contact_email: e.target.value })} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input className="form-input" placeholder="Phone (optional)" value={inquiryForm.contact_phone} onChange={e => setInquiryForm({ ...inquiryForm, contact_phone: e.target.value })} />
                    <input className="form-input" placeholder="City (optional)" value={inquiryForm.city} onChange={e => setInquiryForm({ ...inquiryForm, city: e.target.value })} />
                  </div>
                  <textarea className="form-input" placeholder="Message / Requirements (optional)" rows={3} style={{ resize: 'vertical' }} value={inquiryForm.message} onChange={e => setInquiryForm({ ...inquiryForm, message: e.target.value })} />
                </div>
                <button className="btn btn-primary" type="submit" disabled={inquiryLoading} style={{ width: '100%', marginTop: 14 }}>
                  {inquiryLoading ? 'Submitting...' : 'Submit Request'} {!inquiryLoading && <ArrowRight size={15} />}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <span>© 2026 Anumathi — Intelligent Gate Pass System. Powered by Abhigam.</span>
        <span>Secured with SHA-256 OTP &amp; Timed QR Encryption</span>
      </footer>
    </div>
  );
}