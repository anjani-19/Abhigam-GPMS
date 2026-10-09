import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, CheckCircle2, XCircle, Clock, AlertCircle,
  Eye, Check, X, Users, UserCheck, GraduationCap, Building2, Flame, Zap,
} from 'lucide-react';
import api from '../api';
import Navbar from '../components/Navbar';
import MobileBottomNav from '../components/MobileBottomNav';
import { formatDateTime, formatTimeOnly, getPassTiming, formatDuration } from '../utils/dateUtils';
import { requestNotificationPermission, sendMobileNotification } from '../utils/notifications';

export default function StaffDashboard() {
  const [user, setUser] = useState(null);
  const [passes, setPasses] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [myStudents, setMyStudents] = useState([]);
  const [extensionRequests, setExtensionRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'extensions', 'all', 'staff', 'students', 'colleges'
  const [selectedPass, setSelectedPass] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [staffSubFilter, setStaffSubFilter] = useState('ALL');
  const [now, setNow] = useState(new Date());
  // College onboarding requests (ADMIN only)
  const [collegeRequests, setCollegeRequests] = useState([]);
  const [collegeDecision, setCollegeDecision] = useState({ requestId: null, password: '', domain: '', notes: '' });

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(timer);
  }, []);

  const isPrincipalOrAdmin = (role) => role === 'PRINCIPAL' || role === 'ADMIN';
  const isClassIncharge = (role) => role === 'CLASS_INCHARGE';

  const loadData = async () => {
    try {
      const [meRes, passRes] = await Promise.all([
        api.get('/me'),
        api.get('/gate-passes'),
      ]);
      setUser(meRes.data);
      setPasses(passRes.data);

      try {
        const extRes = await api.get('/extension-requests');
        setExtensionRequests(extRes.data || []);
      } catch (extErr) {
        console.error('Error fetching extension requests', extErr);
      }

      if (isPrincipalOrAdmin(meRes.data.role)) {
        try {
          const staffRes = await api.get('/staff');
          setStaffList(staffRes.data);
        } catch (staffErr) {
          console.error('Error fetching staff list', staffErr);
        }
      }

      // Load college onboarding requests for ADMIN
      if (meRes.data.role === 'ADMIN') {
        try {
          const crRes = await api.get('/admin/college-requests');
          setCollegeRequests(crRes.data || []);
        } catch (crErr) {
          console.error('Error fetching college requests', crErr);
        }
      }

      if (isClassIncharge(meRes.data.role)) {
        try {
          const studRes = await api.get('/class-incharge/students');
          setMyStudents(studRes.data);
        } catch (studErr) {
          console.error('Error fetching student list', studErr);
        }
      }
    } catch (err) {
      console.error('Error fetching faculty data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    requestNotificationPermission();

    const interval = setInterval(() => {
      loadData();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const isAwaitingMyRole = (passStatus, role, isEmergency = false) => {
    if (isEmergency && (role === 'PRINCIPAL' || role === 'ADMIN')) return passStatus.startsWith('PENDING');
    if (role === 'PRINCIPAL' || role === 'ADMIN') return passStatus.startsWith('PENDING');
    if (role === 'CLASS_INCHARGE') return passStatus === 'PENDING_CLASS_INCHARGE';
    if (role === 'HOD') return passStatus === 'PENDING_HOD' || (isEmergency && passStatus.startsWith('PENDING'));
    if (role === 'WARDEN') return passStatus === 'PENDING_WARDEN';
    return false;
  };

  const handleDecision = async (passId, decision) => {
    setActionLoading(true);
    setFeedback({ type: '', text: '' });
    try {
      const res = await api.post(`/gate-passes/${passId}/decision`, {
        decision,
        remarks: remarks || (decision === 'APPROVE' ? 'Approved by faculty' : 'Rejected'),
      });
      const isApprovedQR = res.data.status === 'QR_GENERATED';
      setFeedback({
        type: 'success',
        text: isApprovedQR
          ? `Gate Pass APPROVED! Digital QR issued immediately to student.`
          : `Pass ${decision === 'APPROVE' ? 'approved' : 'rejected'} successfully. New status: ${res.data.status}`,
      });
      setSelectedPass(null);
      setRemarks('');
      loadData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to submit decision.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStaffDecision = async (userId, decision) => {
    setActionLoading(true);
    setFeedback({ type: '', text: '' });
    try {
      const res = await api.post(`/staff/${userId}/decision`, {
        decision,
        remarks: decision === 'APPROVE' ? 'Approved by Principal' : 'Rejected by Principal',
      });
      setFeedback({
        type: 'success',
        text: res.data.message || `Staff status updated to ${decision.toLowerCase()}.`,
      });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to update staff status.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtensionDecision = async (requestId, decision, customRemarks = '') => {
    setActionLoading(true);
    setFeedback({ type: '', text: '' });
    try {
      const res = await api.post(`/extension-requests/${requestId}/decision`, {
        decision,
        remarks: customRemarks || (decision === 'APPROVE' ? 'Approved by faculty' : 'Rejected by faculty'),
      });
      setFeedback({
        type: 'success',
        text: res.data.message || `Extension request ${decision === 'APPROVE' ? 'approved' : 'rejected'}.`,
      });
      await loadData();
      if (selectedPass) {
        try {
          const freshPass = await api.get(`/gate-passes/${selectedPass.id}`);
          setSelectedPass(freshPass.data);
        } catch (_) {}
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to submit extension decision.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '5rem', color: '#64748b' }}>Loading faculty workspace...</div>;
  }

  const pendingMyAction = passes.filter((p) => isAwaitingMyRole(p.status, user?.role, p.is_emergency));
  const pendingEmergencyPasses = passes.filter((p) => p.is_emergency && p.status?.startsWith('PENDING'));
  const pendingStaff = staffList.filter((s) => s.staff_status === 'PENDING');
  const pendingExtensions = extensionRequests.filter((e) => e.status === 'PENDING');
  const displayedPasses = activeTab === 'pending' ? pendingMyAction : passes;
  const displayedStaff = staffSubFilter === 'PENDING' ? staffList.filter((s) => s.staff_status === 'PENDING') : staffList;

  const sp = user?.staff_profile;

  return (
    <div>
      <Navbar user={user} />

      <div className="dashboard-container">
        <div className="dashboard-header">
          <div>
            <h1>JNN INSTITUTE — Faculty &amp; Approval Console</h1>
            <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
              Logged in as: <strong>{user?.name}</strong> ({user?.role?.replace(/_/g, ' ')})
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className={`btn ${activeTab === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('pending')}
            >
              Action Required ({pendingMyAction.length})
            </button>
            <button
              className={`btn ${activeTab === 'extensions' ? 'btn-primary' : 'btn-secondary'}`}
              style={
                pendingExtensions.length > 0 && activeTab !== 'extensions'
                  ? { borderColor: '#f59e0b', color: '#b45309', background: '#fffbeb' }
                  : {}
              }
              onClick={() => setActiveTab('extensions')}
            >
              <Clock size={16} /> Extension Requests ({pendingExtensions.length})
            </button>
            {isPrincipalOrAdmin(user?.role) && (
              <button
                className={`btn ${activeTab === 'staff' ? 'btn-primary' : 'btn-secondary'}`}
                style={
                  pendingStaff.length > 0 && activeTab !== 'staff'
                    ? { borderColor: '#f59e0b', color: '#b45309', background: '#fffbeb' }
                    : {}
                }
                onClick={() => setActiveTab('staff')}
              >
                <Users size={16} /> Faculty Approvals ({pendingStaff.length})
              </button>
            )}
            {isClassIncharge(user?.role) && (
              <button
                className={`btn ${activeTab === 'students' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('students')}
              >
                <GraduationCap size={16} /> My Students ({myStudents.length})
              </button>
            )}
            {user?.role === 'ADMIN' && (
              <button
                className={`btn ${activeTab === 'colleges' ? 'btn-primary' : 'btn-secondary'}`}
                style={
                  collegeRequests.filter(r => r.status === 'PENDING').length > 0 && activeTab !== 'colleges'
                    ? { borderColor: '#6366f1', color: '#4338ca', background: '#eef2ff' }
                    : {}
                }
                onClick={() => setActiveTab('colleges')}
              >
                <Building2 size={16} /> College Requests ({collegeRequests.filter(r => r.status === 'PENDING').length})
              </button>
            )}
            <button
              className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('all')}
            >
              All Passes ({passes.length})
            </button>
          </div>
        </div>

        {/* ── Staff Profile Card (Class Incharge / Warden / Principal) ── */}
        {sp && user?.role !== 'STUDENT' && (
          <div style={{
            background: user?.role === 'CLASS_INCHARGE'
              ? 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 60%, #0ea5e9 100%)'
              : user?.role === 'PRINCIPAL'
              ? 'linear-gradient(135deg, #3b0764 0%, #6d28d9 60%, #7c3aed 100%)'
              : 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 60%, #3b82f6 100%)',
            borderRadius: 16, padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
            color: '#fff', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {user?.role === 'CLASS_INCHARGE' ? <UserCheck size={28} strokeWidth={1.5} /> :
               user?.role === 'PRINCIPAL' ? <ShieldCheck size={28} strokeWidth={1.5} /> :
               <Building2 size={28} strokeWidth={1.5} />}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.01em' }}>{user?.name}</div>
              <div style={{ opacity: 0.85, fontSize: '0.82rem', marginTop: 2 }}>
                {user?.role === 'CLASS_INCHARGE' ? 'Class Incharge' :
                 user?.role === 'PRINCIPAL' ? 'Principal' :
                 user?.role === 'WARDEN' ? 'Hostel Warden' : user?.role?.replace(/_/g, ' ')}
                {sp?.department && <> · <span style={{ fontWeight: 700, opacity: 1 }}>{sp.department}</span></>}
              </div>
              {/* Class Incharge: show section info */}
              {user?.role === 'CLASS_INCHARGE' && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {sp?.year && (
                    <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 8, padding: '2px 10px', fontSize: '0.78rem', fontWeight: 600 }}>
                      📚 {sp.year}
                    </span>
                  )}
                  {sp?.section && (
                    <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 8, padding: '2px 10px', fontSize: '0.78rem', fontWeight: 600 }}>
                      Section {sp.section}
                    </span>
                  )}
                  {sp?.employee_id && (
                    <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 8, padding: '2px 10px', fontSize: '0.78rem' }}>
                      ID: {sp.employee_id}
                    </span>
                  )}
                  {sp?.phone && (
                    <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 8, padding: '2px 10px', fontSize: '0.78rem' }}>
                      📞 {sp.phone}
                    </span>
                  )}
                </div>
              )}
              {/* Principal / other: show emp ID and phone */}
              {user?.role !== 'CLASS_INCHARGE' && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {sp?.employee_id && (
                    <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 8, padding: '2px 10px', fontSize: '0.78rem', fontWeight: 600 }}>
                      ID: {sp.employee_id}
                    </span>
                  )}
                  {sp?.phone && (
                    <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 8, padding: '2px 10px', fontSize: '0.78rem' }}>
                      📞 {sp.phone}
                    </span>
                  )}
                </div>
              )}
            </div>
            {/* Quick stats */}
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '0.6rem 1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{pendingMyAction.length}</div>
                <div style={{ fontSize: '0.68rem', opacity: 0.8, fontWeight: 600 }}>PENDING</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '0.6rem 1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{passes.length}</div>
                <div style={{ fontSize: '0.68rem', opacity: 0.8, fontWeight: 600 }}>TOTAL</div>
              </div>
              {isClassIncharge(user?.role) && (
                <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '0.6rem 1rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{myStudents.length}</div>
                  <div style={{ fontSize: '0.68rem', opacity: 0.8, fontWeight: 600 }}>STUDENTS</div>
                </div>
              )}
            </div>
          </div>
        )}

        {feedback.text && (
          <div className={`alert alert-${feedback.type}`} style={{ marginBottom: '1.5rem' }}>
            {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* 🚨 Urgent Emergency Pass Alert Banner for Staff (Principal, Admin, Incharge) */}
        {pendingEmergencyPasses.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #fff1f2 0%, #fee2e2 100%)',
            border: '2px solid #f87171',
            borderRadius: 14,
            padding: '1.1rem 1.4rem',
            marginBottom: '1.5rem',
            boxShadow: '0 4px 16px rgba(239, 68, 68, 0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.85rem' }}>
              <span style={{
                background: '#dc2626',
                color: '#fff',
                borderRadius: '50%',
                width: 34,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 0 4px rgba(220, 38, 38, 0.2)',
                flexShrink: 0,
              }}>
                <Flame size={20} />
              </span>
              <div>
                <h4 style={{ margin: 0, color: '#991b1b', fontSize: '1.05rem', fontWeight: 800 }}>
                  🚨 ACTION REQUIRED: {pendingEmergencyPasses.length} Emergency Gate Pass Request(s)
                </h4>
                <p style={{ margin: '2px 0 0', color: '#b91c1c', fontSize: '0.83rem' }}>
                  {(user?.role === 'PRINCIPAL' || user?.role === 'ADMIN')
                    ? 'Student(s) require urgent campus exit. Under emergency protocol, Principal approval immediately generates their active exit QR pass.'
                    : 'Student(s) in your section have submitted urgent emergency gate pass requests.'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendingEmergencyPasses.map((ep) => (
                <div key={ep.id} style={{
                  background: '#ffffff',
                  border: '1px solid #fca5a5',
                  borderRadius: 10,
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.9rem' }}>
                      {ep.student_name} <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.82rem' }}>({ep.student_id})</span>
                    </div>
                    <div style={{ color: '#dc2626', fontSize: '0.82rem', fontWeight: 600, marginTop: 2 }}>
                      Reason: {ep.emergency_reason || ep.reason}
                    </div>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      setSelectedPass(ep);
                      setActiveTab('pending');
                    }}
                    style={{
                      background: '#dc2626',
                      borderColor: '#dc2626',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      fontWeight: 700,
                    }}
                  >
                    <Zap size={14} /> Review & Act Now
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon warning">
              <Clock size={24} />
            </div>
            <div className="stat-info">
              <p>Needs Your Approval</p>
              <strong>{pendingMyAction.length}</strong>
            </div>
          </div>

          {isPrincipalOrAdmin(user?.role) && (
            <div
              className="stat-card"
              style={{ cursor: 'pointer' }}
              onClick={() => setActiveTab('staff')}
              title="Click to view Faculty Approvals"
            >
              <div className={`stat-icon ${pendingStaff.length > 0 ? 'warning' : 'success'}`}>
                <UserCheck size={24} />
              </div>
              <div className="stat-info">
                <p>Pending Faculty Approvals</p>
                <strong>{pendingStaff.length}</strong>
              </div>
            </div>
          )}

          <div className="stat-card">
            <div className="stat-icon success">
              <CheckCircle2 size={24} />
            </div>
            <div className="stat-info">
              <p>Active QR Passes</p>
              <strong>{passes.filter((p) => p.status === 'QR_GENERATED').length}</strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <ShieldCheck size={24} />
            </div>
            <div className="stat-info">
              <p>Total Requests</p>
              <strong>{passes.length}</strong>
            </div>
          </div>
        </div>


        {/* ── MY STUDENTS TAB (Class Incharge) ── */}
        {activeTab === 'students' && isClassIncharge(user?.role) && (
          <div className="content-card">
            <div className="content-card-header">
              <div>
                <h3>
                  My Class — {sp?.department} · {sp?.year} · Section {sp?.section}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 2 }}>
                  Students in your assigned section. Total: <strong>{myStudents.length}</strong>
                </p>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Student Name</th>
                    <th>Roll No.</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>CGPA</th>
                    <th>Arrears</th>
                    <th>Accommodation</th>
                  </tr>
                </thead>
                <tbody>
                  {myStudents.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                        No students found in your section.
                      </td>
                    </tr>
                  ) : myStudents.map((s, idx) => (
                    <tr key={s.student_id}>
                      <td style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{idx + 1}</td>
                      <td><strong>{s.full_name}</strong></td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0369a1', fontSize: '0.85rem' }}>
                          {s.student_id}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.82rem', color: '#64748b' }}>{s.email}</td>
                      <td style={{ fontSize: '0.85rem' }}>{s.phone || '—'}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: parseFloat(s.cgpa) >= 8 ? '#16a34a' : parseFloat(s.cgpa) >= 6 ? '#d97706' : '#dc2626' }}>
                          {s.cgpa || '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: (s.arrears || 0) > 0 ? '#dc2626' : '#16a34a' }}>
                          {s.arrears ?? 0}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600,
                          background: s.accommodation === 'HOSTELLER' ? '#e0f2fe' : '#f0fdf4',
                          color: s.accommodation === 'HOSTELLER' ? '#0369a1' : '#16a34a',
                        }}>
                          {s.accommodation === 'HOSTELLER' ? 'Hosteller' : 'Day Scholar'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'colleges' && user?.role === 'ADMIN' ? (
          <div className="content-card">
            <div className="content-card-header">
              <div>
                <h3>College Onboarding Requests</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Review and approve/reject college access requests</p>
              </div>
            </div>
            {collegeRequests.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No college requests yet.</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr>
                    <th>College</th><th>Contact</th><th>Email</th><th>Phone</th><th>City</th><th>Status</th><th>Date</th><th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {collegeRequests.map((cr) => (
                      <React.Fragment key={cr.id}>
                        <tr>
                          <td style={{ fontWeight: 600 }}>{cr.college_name}</td>
                          <td>{cr.contact_name}</td>
                          <td><span style={{ fontSize: '0.82rem' }}>{cr.contact_email}</span></td>
                          <td>{cr.contact_phone || '—'}</td>
                          <td>{cr.city || '—'}</td>
                          <td>
                            <span className={`badge ${cr.status === 'APPROVED' ? 'badge-success' : cr.status === 'REJECTED' ? 'badge-danger' : 'badge-warning'}`}>
                              {cr.status}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.82rem' }}>{cr.created_at ? new Date(cr.created_at).toLocaleDateString() : '—'}</td>
                          <td>
                            {cr.status === 'PENDING' ? (
                              <button className="btn btn-sm btn-primary" onClick={() => setCollegeDecision({ requestId: cr.id, password: '', domain: '', notes: '' })}>
                                Review
                              </button>
                            ) : (
                              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{cr.admin_notes || (cr.status === 'APPROVED' ? 'Approved' : 'Rejected')}</span>
                            )}
                          </td>
                        </tr>
                        {cr.message && (
                          <tr><td colSpan={8} style={{ background: '#f8fafc', padding: '6px 16px', fontSize: '0.82rem', color: '#475569', borderTop: 'none' }}>💬 {cr.message}</td></tr>
                        )}
                        {/* Inline decision form */}
                        {collegeDecision.requestId === cr.id && (
                          <tr><td colSpan={8} style={{ background: '#fafbff', padding: '16px' }}>
                            <div style={{ display: 'grid', gap: 10, maxWidth: 500 }}>
                              <strong style={{ fontSize: '0.9rem' }}>Approve or Reject: {cr.college_name}</strong>
                              <input
                                className="form-control"
                                placeholder="Temp password for college admin (required for approval)"
                                type="text"
                                value={collegeDecision.password}
                                onChange={e => setCollegeDecision({ ...collegeDecision, password: e.target.value })}
                              />
                              <input
                                className="form-control"
                                placeholder="Allowed email domain, e.g. abc.edu.in (optional)"
                                value={collegeDecision.domain}
                                onChange={e => setCollegeDecision({ ...collegeDecision, domain: e.target.value })}
                              />
                              <input
                                className="form-control"
                                placeholder="Admin notes (optional)"
                                value={collegeDecision.notes}
                                onChange={e => setCollegeDecision({ ...collegeDecision, notes: e.target.value })}
                              />
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-success" disabled={actionLoading} onClick={async () => {
                                  if (!collegeDecision.password) { setFeedback({ type: 'error', text: 'Temporary password is required to approve' }); return; }
                                  setActionLoading(true);
                                  try {
                                    await api.post(`/admin/college-requests/${cr.id}/decision`, {
                                      decision: 'APPROVE',
                                      admin_password: collegeDecision.password,
                                      allowed_email_domain: collegeDecision.domain || null,
                                      admin_notes: collegeDecision.notes || null,
                                    });
                                    setFeedback({ type: 'success', text: `College "${cr.college_name}" approved! Admin credentials sent to ${cr.contact_email}.` });
                                    setCollegeDecision({ requestId: null, password: '', domain: '', notes: '' });
                                    loadData();
                                  } catch (err) {
                                    setFeedback({ type: 'error', text: err.response?.data?.detail || 'Failed to approve' });
                                  } finally { setActionLoading(false); }
                                }}>
                                  <CheckCircle2 size={14} /> Approve
                                </button>
                                <button className="btn btn-danger" disabled={actionLoading} onClick={async () => {
                                  setActionLoading(true);
                                  try {
                                    await api.post(`/admin/college-requests/${cr.id}/decision`, {
                                      decision: 'REJECT',
                                      admin_notes: collegeDecision.notes || 'Request rejected by admin',
                                    });
                                    setFeedback({ type: 'success', text: `College request from "${cr.college_name}" rejected.` });
                                    setCollegeDecision({ requestId: null, password: '', domain: '', notes: '' });
                                    loadData();
                                  } catch (err) {
                                    setFeedback({ type: 'error', text: err.response?.data?.detail || 'Failed to reject' });
                                  } finally { setActionLoading(false); }
                                }}>
                                  <XCircle size={14} /> Reject
                                </button>
                                <button className="btn btn-secondary" onClick={() => setCollegeDecision({ requestId: null, password: '', domain: '', notes: '' })}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeTab === 'staff' ? (
          <div className="content-card">
            <div className="content-card-header">
              <div>
                <h3>Faculty &amp; Staff Registration Approvals</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 2 }}>
                  Review staff registration requests and grant portal access.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Filter:</span>
                <button
                  className={`btn btn-sm ${staffSubFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setStaffSubFilter('ALL')}
                >
                  All Staff ({staffList.length})
                </button>
                <button
                  className={`btn btn-sm ${staffSubFilter === 'PENDING' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setStaffSubFilter('PENDING')}
                >
                  Pending Review ({pendingStaff.length})
                </button>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Faculty Name &amp; Role</th>
                    <th>Email Address</th>
                    <th>Employee ID</th>
                    <th>Department / Assignment</th>
                    <th>Contact Phone</th>
                    <th>Registered On</th>
                    <th>Account Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStaff.map((s) => {
                    const isPending = s.staff_status === 'PENDING';
                    const isApproved = s.staff_status === 'APPROVED';
                    const isRejected = s.staff_status === 'REJECTED';
                    // Don't show principal in the staff approval list (principals are auto-approved, no actions needed)
                    if (s.role === 'PRINCIPAL') return null;

                    return (
                      <tr key={s.id}>
                        <td>
                          <div>
                            <strong>{s.full_name}</strong>
                          </div>
                          <span
                            style={{
                              display: 'inline-block',
                              fontSize: '0.72rem',
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: '#e0e7ff',
                              color: '#3730a3',
                              fontWeight: 600,
                              marginTop: 3,
                            }}
                          >
                            {s.role.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          <div>{s.email}</div>
                          {s.email_verified ? (
                            <small style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.75rem', marginTop: 2 }}>
                              <CheckCircle2 size={12} /> Email Verified
                            </small>
                          ) : (
                            <small style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.75rem', marginTop: 2 }}>
                              <Clock size={12} /> Email Unverified
                            </small>
                          )}
                        </td>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
                            {s.employee_id || '—'}
                          </span>
                        </td>
                        <td>
                          <div>{s.department || 'General Faculty'}</div>
                          {s.year && <small style={{ color: '#7c3aed', fontWeight: 600 }}>{s.year} {s.section ? `· Sec ${s.section}` : ''}</small>}
                          {s.designation && <small style={{ color: '#64748b', display: 'block' }}>{s.designation}</small>}
                        </td>
                        <td>{s.phone || '—'}</td>
                        <td>
                          <small style={{ color: '#64748b' }}>
                            {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}
                          </small>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              isApproved
                                ? 'badge-approved'
                                : isRejected
                                ? 'badge-rejected'
                                : 'badge-pending'
                            }`}
                          >
                            {s.staff_status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            {isPending ? (
                              <>
                                <button
                                  className="btn btn-sm btn-success"
                                  disabled={actionLoading}
                                  onClick={() => handleStaffDecision(s.id, 'APPROVE')}
                                  title="Approve staff registration"
                                >
                                  <Check size={14} /> Approve
                                </button>
                                <button
                                  className="btn btn-sm btn-danger"
                                  disabled={actionLoading}
                                  onClick={() => handleStaffDecision(s.id, 'REJECT')}
                                  title="Reject staff registration"
                                >
                                  <X size={14} /> Reject
                                </button>
                              </>
                            ) : isApproved ? (
                              <button
                                className="btn btn-sm btn-secondary"
                                style={{ color: '#dc2626' }}
                                disabled={actionLoading}
                                onClick={() => handleStaffDecision(s.id, 'REJECT')}
                                title="Revoke staff approval"
                              >
                                Revoke
                              </button>
                            ) : (
                              <button
                                className="btn btn-sm btn-secondary"
                                style={{ color: '#16a34a' }}
                                disabled={actionLoading}
                                onClick={() => handleStaffDecision(s.id, 'APPROVE')}
                                title="Approve staff registration"
                              >
                                Re-approve
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {displayedStaff.filter(s => s.role !== 'PRINCIPAL').length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                        {staffSubFilter === 'PENDING'
                          ? '🎉 No pending faculty registrations awaiting approval.'
                          : 'No faculty records found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'extensions' ? (
          <div className="content-card">
            <div className="content-card-header">
              <div>
                <h3>Student QR Validity Extension Requests</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 2 }}>
                  Review requests submitted by students to extend their campus return time &amp; QR pass validity.
                </p>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student Name &amp; ID</th>
                    <th>Dept &amp; Section</th>
                    <th>Pass ID</th>
                    <th>Extension Details</th>
                    <th>Current Return ➔ Proposed</th>
                    <th>Reason Given</th>
                    <th>Requested On</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Faculty Action</th>
                  </tr>
                </thead>
                <tbody>
                  {extensionRequests.map((er) => {
                    const isPending = er.status === 'PENDING';
                    return (
                      <tr key={er.id}>
                        <td>
                          <div><strong>{er.student_name}</strong></div>
                          <small style={{ color: '#64748b' }}>{er.student_id}</small>
                        </td>
                        <td>
                          <div>{er.department || '—'}</div>
                          {er.section && <small style={{ color: '#7c3aed', fontWeight: 600 }}>Sec {er.section}</small>}
                        </td>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
                            {er.gate_pass_code}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: '#4338ca', background: '#e0e7ff', padding: '3px 8px', borderRadius: 6, fontWeight: 700, fontSize: '0.82rem' }}>
                            +{er.extension_minutes} Mins
                          </span>
                        </td>
                        <td>
                          <div><small style={{ color: '#64748b' }}>Current: {formatTimeOnly(er.current_return_at)}</small></div>
                          <div style={{ fontWeight: 700, color: '#059669' }}>➔ {formatDateTime(er.new_return_at)}</div>
                        </td>
                        <td style={{ maxWidth: 220, fontSize: '0.85rem' }}>{er.reason}</td>
                        <td>
                          <small style={{ color: '#64748b' }}>{formatDateTime(er.created_at)}</small>
                        </td>
                        <td>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            background: er.status === 'APPROVED' ? '#dcfce7' : er.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                            color: er.status === 'APPROVED' ? '#15803d' : er.status === 'REJECTED' ? '#b91c1c' : '#b45309'
                          }}>
                            {er.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {isPending ? (
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button
                                className="btn btn-sm btn-success"
                                disabled={actionLoading}
                                onClick={() => handleExtensionDecision(er.id, 'APPROVE')}
                                title="Approve extension"
                              >
                                <Check size={14} /> Accept (+{er.extension_minutes}m)
                              </button>
                              <button
                                className="btn btn-sm btn-danger"
                                disabled={actionLoading}
                                onClick={() => handleExtensionDecision(er.id, 'REJECT')}
                                title="Reject extension"
                              >
                                <X size={14} /> Reject
                              </button>
                            </div>
                          ) : (
                            <small style={{ color: '#64748b' }}>
                              {er.reviewed_by ? `By ${er.reviewed_by} (${er.reviewed_role})` : 'Completed'}
                            </small>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {extensionRequests.length === 0 && (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                        🎉 No extension requests recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab !== 'students' ? (
          <div className="content-card">
            <div className="content-card-header">
              <h3>{activeTab === 'pending' ? 'Passes Awaiting Your Review' : 'All Student Anumathi Passes'}</h3>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                Showing {displayedPasses.length} records
              </span>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Anumathi Pass ID</th>
                    <th>Student Name</th>
                    <th>Reason</th>
                    <th>Exit Window</th>
                    <th>Parent Contact</th>
                    <th>Current Status</th>
                    <th style={{ textAlign: 'right' }}>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedPasses.map((p) => {
                    const needsAction = isAwaitingMyRole(p.status, user?.role, p.is_emergency);
                    const timing = getPassTiming(p, now);
                    return (
                      <tr key={p.id}>
                        <td>
                          <strong style={{ fontFamily: 'monospace', color: '#334155' }}>{p.gate_pass_id}</strong>
                        </td>
                        <td>
                          <div><strong>{p.student_name}</strong></div>
                          <small style={{ color: '#64748b' }}>{p.student_id}</small>
                        </td>
                        <td style={{ maxWidth: 220 }}>{p.reason}</td>
                        <td>
                          <div><strong>{formatDateTime(p.exit_at)}</strong></div>
                          <small style={{ color: '#64748b', display: 'block' }}>
                            Return: {formatDateTime(p.return_at)}
                            {p.pending_extension && (
                              <span style={{ color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: 4, fontWeight: 700, marginLeft: 4, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                <Clock size={10} /> Ext Req (+{p.pending_extension.extension_minutes}m)
                              </span>
                            )}
                            {p.extension_count > 0 && (
                              <span style={{ color: '#4338ca', fontWeight: 700, marginLeft: 4 }}>
                                (Extended {p.extension_count})
                              </span>
                            )}
                          </small>
                          {(p.status === 'QR_GENERATED' || p.status === 'EXITED') && (
                            <div style={{ marginTop: 3 }}>
                              {timing?.isActive ? (
                                <span style={{ color: '#059669', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                  ⏱️ Expiring in {formatDuration(timing.secondsUntilExpiry)}
                                </span>
                              ) : timing?.isEarly ? (
                                <span style={{ color: '#b45309', fontSize: '0.75rem', fontWeight: 600 }}>
                                  ⏳ Activates in {formatDuration(timing.secondsUntilActivation)}
                                </span>
                              ) : timing?.isExpired ? (
                                <span style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600 }}>
                                  Expired
                                </span>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td>
                          <div>{p.guardian_name || 'N/A'}</div>
                          <small style={{ color: '#64748b' }}>{p.guardian_phone || 'N/A'}</small>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                            {p.is_emergency && (
                              <span style={{
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: '#fee2e2',
                                color: '#dc2626',
                                border: '1px solid #f87171',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                              }}>
                                🚨 EMERGENCY
                              </span>
                            )}
                            <span className={`badge ${p.status === 'QR_GENERATED' ? 'badge-approved' : p.status === 'REJECTED' ? 'badge-rejected' : 'badge-pending'}`}>
                              {p.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {needsAction ? (
                            <button
                              className="btn btn-sm"
                              style={{
                                background: p.is_emergency ? '#dc2626' : undefined,
                                borderColor: p.is_emergency ? '#dc2626' : undefined,
                                color: p.is_emergency ? '#ffffff' : undefined,
                                fontWeight: p.is_emergency ? 700 : undefined,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                              onClick={() => { setSelectedPass(p); setRemarks(''); }}
                            >
                              {p.is_emergency ? <Zap size={14} /> : <CheckCircle2 size={14} />}
                              {p.is_emergency ? 'Emergency Review' : 'Review & Act'}
                            </button>
                          ) : (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setSelectedPass(p)}
                            >
                              <Eye size={14} /> View
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {displayedPasses.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                        {activeTab === 'pending'
                          ? '✨ All caught up! No Anumathi pass requests waiting for approval.'
                          : 'No passes found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>


      {/* Review Modal */}
      {selectedPass && (
        <div className="modal-backdrop" onClick={() => setSelectedPass(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div>
                <h3>Review Anumathi Pass Request</h3>
                <span style={{ fontFamily: 'monospace', color: '#4f46e5', fontWeight: 600 }}>
                  {selectedPass.gate_pass_id}
                </span>
              </div>
              <button className="btn-close" onClick={() => setSelectedPass(null)}>
                <X size={20} />
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: 12, marginBottom: '1.25rem', fontSize: '0.9rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.8rem', display: 'block' }}>Student</span>
                  <strong>{selectedPass.student_name}</strong> ({selectedPass.student_id})
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.8rem', display: 'block' }}>Parent</span>
                  <strong>{selectedPass.guardian_name || 'N/A'}</strong> ({selectedPass.guardian_phone || 'N/A'})
                </div>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.8rem', display: 'block' }}>Reason for Outing</span>
                <p style={{ margin: '4px 0 0', color: '#1e293b' }}>{selectedPass.reason}</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.8rem', display: 'block' }}>Departure Date &amp; Time</span>
                  <strong>{formatDateTime(selectedPass.exit_at)}</strong>
                  <small style={{ color: '#4f46e5', display: 'block', fontSize: '0.72rem' }}>⚡ QR activates at this exact time</small>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.8rem', display: 'block' }}>Expected Return</span>
                  <strong style={{ color: '#0f172a' }}>{formatDateTime(selectedPass.return_at)}</strong>
                  {selectedPass.extension_count > 0 && (
                    <span style={{ marginLeft: 6, fontSize: '0.72rem', background: '#e0e7ff', color: '#4338ca', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                      Extended ({selectedPass.extension_count})
                    </span>
                  )}
                  <small style={{ color: '#64748b', display: 'block', fontSize: '0.72rem' }}>⏱️ Expires 30m after return</small>
                </div>
              </div>

              {(selectedPass.status === 'QR_GENERATED' || selectedPass.status === 'EXITED') && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontSize: '0.8rem' }}>QR Expiry Window (+30m):</span>
                  {(() => {
                    const selTiming = getPassTiming(selectedPass, now);
                    return (
                      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                        {selTiming?.isActive ? (
                          <span style={{ color: '#059669', background: '#d1fae5', padding: '2px 8px', borderRadius: 4 }}>
                            ⏱️ Expiring in {formatDuration(selTiming.secondsUntilExpiry)}
                          </span>
                        ) : selTiming?.isEarly ? (
                          <span style={{ color: '#b45309' }}>
                            ⏳ Activates in {formatDuration(selTiming.secondsUntilActivation)}
                          </span>
                        ) : (
                          <span style={{ color: '#dc2626' }}>Expired</span>
                        )}
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>

            {selectedPass.pending_extension && (
              <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: '12px 14px', marginBottom: '1.25rem', color: '#92400e' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.9rem' }}>
                    <Clock size={16} color="#d97706" />
                    <span>Student Requested QR Validity Extension</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', background: '#fef3c7', padding: '2px 8px', borderRadius: 6, fontWeight: 700, color: '#b45309' }}>
                    +{selectedPass.pending_extension.extension_minutes} Mins
                  </span>
                </div>
                <div style={{ fontSize: '0.82rem', color: '#78350f', lineHeight: 1.5, marginBottom: 10 }}>
                  <div><strong>Reason:</strong> {selectedPass.pending_extension.reason}</div>
                  <div><strong>Proposed Return:</strong> {formatDateTime(selectedPass.pending_extension.projected_return_at || selectedPass.pending_extension.new_return_at)}</div>
                  <small style={{ color: '#b45309' }}>Requested: {formatDateTime(selectedPass.pending_extension.created_at)}</small>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-sm btn-success"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    disabled={actionLoading}
                    onClick={() => handleExtensionDecision(selectedPass.pending_extension.id, 'APPROVE')}
                  >
                    <Check size={14} /> Accept (+{selectedPass.pending_extension.extension_minutes}m)
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    disabled={actionLoading}
                    onClick={() => handleExtensionDecision(selectedPass.pending_extension.id, 'REJECT')}
                  >
                    <X size={14} /> Reject Extension
                  </button>
                </div>
              </div>
            )}

            {selectedPass.is_emergency && (
              <div style={{
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                borderRadius: 10,
                padding: '12px 14px',
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <Flame size={22} color="#dc2626" />
                <div style={{ fontSize: '0.84rem' }}>
                  <strong style={{ color: '#9f1239', display: 'block', marginBottom: 2 }}>
                    🚨 EMERGENCY GATE PASS PROTOCOL
                  </strong>
                  <span style={{ color: '#be123c', lineHeight: 1.4 }}>
                    {(user?.role === 'PRINCIPAL' || user?.role === 'ADMIN')
                      ? 'As Principal / Admin, approving this emergency pass immediately generates the exit QR code for the student.'
                      : 'As Class Incharge, approving will endorse and forward this pass for instant HOD / Principal clearance.'}
                  </span>
                </div>
              </div>
            )}

            {isAwaitingMyRole(selectedPass.status, user?.role, selectedPass.is_emergency) ? (
              <div>
                <div className="form-group">
                  <label>Approver Remarks / Instructions</label>
                  <input
                    className="form-control"
                    placeholder="Optional remarks (e.g. Approved for medical visit, Parent verified)"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: '1.5rem' }}>
                  <button
                    className="btn btn-danger"
                    style={{ flex: 1 }}
                    disabled={actionLoading}
                    onClick={() => handleDecision(selectedPass.id, 'REJECT')}
                  >
                    <XCircle size={16} /> Reject Request
                  </button>
                  <button
                    className="btn"
                    style={{
                      flex: 1,
                      background: selectedPass.is_emergency ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 700,
                    }}
                    disabled={actionLoading}
                    onClick={() => handleDecision(selectedPass.id, 'APPROVE')}
                  >
                    {selectedPass.is_emergency ? <Zap size={16} /> : <CheckCircle2 size={16} />}
                    {selectedPass.is_emergency
                      ? ((user?.role === 'PRINCIPAL' || user?.role === 'ADMIN') ? 'Approve & Issue Instant QR' : 'Endorse Emergency Pass')
                      : 'Approve Pass'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1rem', color: '#64748b' }}>
                <p>Current Status: <strong>{selectedPass.status.replace(/_/g, ' ')}</strong></p>
                <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => setSelectedPass(null)}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav />
    </div>
  );
}
