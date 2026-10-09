import React, { useState, useEffect } from 'react';
import {
  GraduationCap, Users, BookOpen, UserCheck, ChevronDown, ChevronRight,
  Search, Shield, CheckCircle2, AlertCircle, Clock, ShieldCheck,
  Building2, Eye, X, Check, Filter,
} from 'lucide-react';
import api from '../api';
import Navbar from '../components/Navbar';
import { formatDateTime, formatTimeOnly, getPassTiming, formatDuration } from '../utils/dateUtils';

export default function HODDashboard() {
  const [user, setUser] = useState(null);
  const [passes, setPasses] = useState([]);
  const [hodData, setHodData] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [extensionRequests, setExtensionRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('passes'); // 'passes', 'extensions', 'students', 'staff'
  const [expandedYears, setExpandedYears] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [selectedPass, setSelectedPass] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [actionLoading, setActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [passFilter, setPassFilter] = useState('pending'); // 'pending', 'all'
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(timer);
  }, []);

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
        console.error('Error loading extension requests in HOD dashboard', extErr);
      }

      const [hodRes, staffRes] = await Promise.all([
        api.get('/hod/students'),
        api.get('/staff').catch(() => ({ data: [] })),
      ]);
      setHodData(hodRes.data);
      setStaffList(staffRes.data || []);

      // Default: expand all years
      if (hodRes.data?.years) {
        const exp = {};
        hodRes.data.years.forEach((y) => { exp[y.year_id] = true; });
        setExpandedYears(exp);
      }
    } catch (err) {
      console.error('HOD data load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const pendingPasses = passes.filter((p) => p.status === 'PENDING_HOD');
  const pendingExtensions = extensionRequests.filter((e) => e.status === 'PENDING');
  const displayedPasses = passFilter === 'pending' ? pendingPasses : passes;

  const handleDecision = async (passId, decision) => {
    setActionLoading(true);
    setFeedback({ type: '', text: '' });
    try {
      const res = await api.post(`/gate-passes/${passId}/decision`, {
        decision,
        remarks: remarks || (decision === 'APPROVE' ? 'Approved by HOD' : 'Rejected by HOD'),
      });
      setFeedback({
        type: 'success',
        text: `Pass ${decision === 'APPROVE' ? 'approved' : 'rejected'}. New status: ${res.data.status}`,
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

  const handleExtensionDecision = async (requestId, decision, customRemarks = '') => {
    setActionLoading(true);
    setFeedback({ type: '', text: '' });
    try {
      const res = await api.post(`/extension-requests/${requestId}/decision`, {
        decision,
        remarks: customRemarks || (decision === 'APPROVE' ? 'Approved by HOD' : 'Rejected by HOD'),
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

  const totalStudents = hodData?.years?.reduce(
    (acc, yr) => acc + yr.sections.reduce((a, s) => a + s.student_count, 0), 0
  ) ?? 0;

  const getStatusBadge = (status) => {
    const map = {
      PENDING_CLASS_INCHARGE: { label: 'Awaiting Incharge', color: '#d97706', bg: '#fffbeb' },
      PENDING_HOD: { label: 'Awaiting HOD', color: '#7c3aed', bg: '#ede9fe' },
      PENDING_PRINCIPAL: { label: 'Awaiting Principal', color: '#1d4ed8', bg: '#eff6ff' },
      PENDING_WARDEN: { label: 'Awaiting Warden', color: '#0d9488', bg: '#f0fdfa' },
      QR_GENERATED: { label: 'QR Issued', color: '#16a34a', bg: '#f0fdf4' },
      REJECTED: { label: 'Rejected', color: '#dc2626', bg: '#fef2f2' },
      EXITED: { label: 'Exited', color: '#0ea5e9', bg: '#f0f9ff' },
      RETURNED: { label: 'Returned', color: '#64748b', bg: '#f8fafc' },
    };
    const s = map[status] || { label: status, color: '#64748b', bg: '#f8fafc' };
    return (
      <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
        {s.label}
      </span>
    );
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '5rem', color: '#64748b' }}>Loading HOD workspace…</div>;

  const sp = user?.staff_profile;

  return (
    <div>
      <Navbar user={user} />
      <div className="dashboard-container">

        {/* Header */}
        <div className="dashboard-header">
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Building2 size={28} style={{ color: '#7c3aed' }} />
              HOD Dashboard — {hodData?.department || sp?.department || 'Department'}
            </h1>
            <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
              Head of Department: <strong>{user?.name}</strong>
              {sp?.department && <> · <span style={{ color: '#7c3aed', fontWeight: 600 }}>{sp.department}</span></>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className={`btn ${activeTab === 'passes' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('passes')}>
              Gate Passes {pendingPasses.length > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 7px', marginLeft: 6, fontSize: '0.75rem' }}>{pendingPasses.length}</span>}
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
              <Clock size={16} /> Extension Requests {pendingExtensions.length > 0 && <span style={{ background: '#f59e0b', color: '#fff', borderRadius: 10, padding: '1px 7px', marginLeft: 6, fontSize: '0.75rem' }}>{pendingExtensions.length}</span>}
            </button>
            <button className={`btn ${activeTab === 'students' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('students')}>
              <Users size={16} /> Students ({totalStudents})
            </button>
          </div>
        </div>

        {/* Profile Card */}
        {sp && (
          <div style={{
            background: 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 60%, #7c3aed 100%)',
            borderRadius: 16, padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
            color: '#fff', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center',
            boxShadow: '0 8px 24px rgba(109,40,217,0.25)',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <GraduationCap size={32} strokeWidth={1.5} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.01em' }}>{user?.name}</div>
              <div style={{ opacity: 0.85, fontSize: '0.85rem', marginTop: 2 }}>
                Head of Department — {sp?.department || hodData?.department}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                {sp?.employee_id && <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 8, padding: '2px 10px', fontSize: '0.78rem', fontWeight: 600 }}>ID: {sp.employee_id}</span>}
                {sp?.phone && <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 8, padding: '2px 10px', fontSize: '0.78rem' }}>📞 {sp.phone}</span>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, minWidth: 220 }}>
              {[
                { label: 'Total Students', value: totalStudents, icon: <Users size={16} /> },
                { label: 'Pending Passes', value: pendingPasses.length, icon: <Clock size={16} /> },
                { label: 'Extension Reqs', value: pendingExtensions.length, icon: <Clock size={16} /> },
                { label: 'Total Passes', value: passes.length, icon: <ShieldCheck size={16} /> },
              ].map((st) => (
                <div key={st.label} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '0.6rem 0.85rem', textAlign: 'center' }}>
                  <div style={{ opacity: 0.7, marginBottom: 2, display: 'flex', justifyContent: 'center' }}>{st.icon}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{st.value}</div>
                  <div style={{ fontSize: '0.67rem', opacity: 0.75, fontWeight: 600 }}>{st.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {feedback.text && (
          <div className={`alert alert-${feedback.type}`} style={{ marginBottom: '1.5rem' }}>
            {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* ── GATE PASSES TAB ── */}
        {activeTab === 'passes' && (
          <div className="content-card">
            <div className="content-card-header">
              <div>
                <h3>Gate Pass Approvals</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 2 }}>
                  Passes from students in your department requiring HOD review.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={`btn btn-sm ${passFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPassFilter('pending')}>
                  Pending ({pendingPasses.length})
                </button>
                <button className={`btn btn-sm ${passFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPassFilter('all')}>
                  All ({passes.length})
                </button>
              </div>
            </div>

            {selectedPass && (
              <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '1.25rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <h4 style={{ margin: 0, color: '#1e293b' }}>Review Pass: {selectedPass.gate_pass_id}</h4>
                    <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                      Student: <strong>{selectedPass.student_name}</strong> ({selectedPass.student_id})
                    </span>
                  </div>
                  <button className="btn btn-sm btn-secondary" onClick={() => setSelectedPass(null)}><X size={14} /></button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', background: '#ffffff', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Departure (Exit Time)</span>
                    <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>{formatDateTime(selectedPass.exit_at)}</strong>
                    <small style={{ color: '#4f46e5', display: 'block', fontSize: '0.72rem' }}>⚡ QR activates at this exact time</small>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Expected Return</span>
                    <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>{formatDateTime(selectedPass.return_at)}</strong>
                    {selectedPass.extension_count > 0 && (
                      <span style={{ marginLeft: 6, fontSize: '0.72rem', background: '#ede9fe', color: '#6d28d9', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                        Extended ({selectedPass.extension_count})
                      </span>
                    )}
                    <small style={{ color: '#64748b', display: 'block', fontSize: '0.72rem' }}>⏱️ Expires 30m after return</small>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Reason</span>
                    <span style={{ fontSize: '0.85rem', color: '#334155' }}>{selectedPass.reason}</span>
                  </div>
                </div>

                {/* Pending Extension Review Box in HOD panel */}
                {selectedPass.pending_extension && (
                  <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, color: '#92400e' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={15} color="#d97706" /> Student Requested Extension
                      </span>
                      <span style={{ fontSize: '0.75rem', background: '#fef3c7', padding: '2px 8px', borderRadius: 6, fontWeight: 700, color: '#b45309' }}>
                        +{selectedPass.pending_extension.extension_minutes} Mins
                      </span>
                    </div>
                    <div style={{ fontSize: '0.82rem', marginBottom: 8, lineHeight: 1.4 }}>
                      <div><strong>Reason:</strong> {selectedPass.pending_extension.reason}</div>
                      <div><strong>Proposed Return:</strong> {formatDateTime(selectedPass.pending_extension.projected_return_at || selectedPass.pending_extension.new_return_at)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-sm btn-success"
                        disabled={actionLoading}
                        onClick={() => handleExtensionDecision(selectedPass.pending_extension.id, 'APPROVE')}
                      >
                        <Check size={14} /> Accept Extension (+{selectedPass.pending_extension.extension_minutes}m)
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={actionLoading}
                        onClick={() => handleExtensionDecision(selectedPass.pending_extension.id, 'REJECT')}
                      >
                        <X size={14} /> Reject Extension
                      </button>
                    </div>
                  </div>
                )}

                <textarea
                  className="form-control"
                  placeholder="Approver remarks / notes (optional)"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={2}
                  style={{ marginBottom: 10, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-success" disabled={actionLoading} onClick={() => handleDecision(selectedPass.id, 'APPROVE')}>
                    <Check size={16} /> Approve Pass
                  </button>
                  <button className="btn btn-danger" disabled={actionLoading} onClick={() => handleDecision(selectedPass.id, 'REJECT')}>
                    <X size={16} /> Reject Pass
                  </button>
                </div>
              </div>
            )}

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Pass ID</th>
                    <th>Student</th>
                    <th>Reason</th>
                    <th>Departure Time</th>
                    <th>Expected Return</th>
                    <th>QR Expiry (+30m)</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedPasses.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No passes found</td></tr>
                  ) : displayedPasses.map((p) => {
                    const timing = getPassTiming(p, now);
                    return (
                      <tr key={p.id}>
                        <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#6d28d9', fontSize: '0.85rem' }}>{p.gate_pass_id}</span></td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.student_name}</div>
                          <small style={{ color: '#64748b' }}>{p.student_id}</small>
                        </td>
                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#475569', fontSize: '0.87rem' }}>{p.reason}</td>
                        <td>
                          <strong>{formatDateTime(p.exit_at)}</strong>
                        </td>
                        <td>
                          <strong>{formatDateTime(p.return_at)}</strong>
                          {p.pending_extension && (
                            <span style={{ color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: 4, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                              <Clock size={10} /> Ext Req (+{p.pending_extension.extension_minutes}m)
                            </span>
                          )}
                          {p.extension_count > 0 && (
                            <span style={{ color: '#6d28d9', fontSize: '0.72rem', fontWeight: 700, display: 'block', marginTop: 2 }}>
                              ⚡ Extended ({p.extension_count})
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{ color: '#334155', fontSize: '0.85rem', display: 'block' }}>
                            {formatDateTime(timing?.expiryDate)}
                          </span>
                          {timing?.isActive && (
                            <span style={{ color: '#059669', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                              ⏱️ Expiring in {formatDuration(timing.secondsUntilExpiry)}
                            </span>
                          )}
                          {timing?.isEarly && p.status === 'QR_GENERATED' && (
                            <span style={{ color: '#b45309', fontSize: '0.75rem', fontWeight: 600, display: 'block', marginTop: 2 }}>
                              ⏳ Activates in {formatDuration(timing.secondsUntilActivation)}
                            </span>
                          )}
                          {timing?.isExpired && p.status !== 'RETURNED' && (
                            <span style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600, display: 'block', marginTop: 2 }}>
                              Expired
                            </span>
                          )}
                        </td>
                        <td>{getStatusBadge(p.status)}</td>
                        <td style={{ textAlign: 'right' }}>
                          {p.status === 'PENDING_HOD' ? (
                            <button className="btn btn-sm btn-primary" onClick={() => { setSelectedPass(p); setRemarks(''); }}>
                              <Eye size={14} /> Review
                            </button>
                          ) : (
                            <button className="btn btn-sm btn-secondary" onClick={() => setSelectedPass(p)}>
                              <Eye size={14} /> View
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── EXTENSION REQUESTS TAB ── */}
        {activeTab === 'extensions' && (
          <div className="content-card">
            <div className="content-card-header">
              <div>
                <h3>Student QR Validity Extension Requests</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 2 }}>
                  Department requests submitted by students to extend their campus return time &amp; QR validity.
                </p>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student Name &amp; ID</th>
                    <th>Class / Section</th>
                    <th>Pass ID</th>
                    <th>Extension Details</th>
                    <th>Current Return ➔ Proposed</th>
                    <th>Reason Given</th>
                    <th>Requested On</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>HOD Action</th>
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
                          <div>{er.year || 'Department'}</div>
                          {er.section && <small style={{ color: '#7c3aed', fontWeight: 600 }}>Sec {er.section}</small>}
                        </td>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#6d28d9' }}>
                            {er.gate_pass_code}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: '#4338ca', background: '#ede9fe', padding: '3px 8px', borderRadius: 6, fontWeight: 700, fontSize: '0.82rem' }}>
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
        )}

        {/* ── STUDENTS TAB ── */}
        {activeTab === 'students' && (
          <div>
            <div style={{ marginBottom: '1rem', position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                className="form-control"
                placeholder="Search by name, student ID or roll number…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: 38 }}
              />
            </div>

            {!hodData?.years?.length ? (
              <div className="content-card" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                <GraduationCap size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
                <p>No student data found for your department.</p>
              </div>
            ) : hodData.years.map((yr) => {
              const allStudents = yr.sections.flatMap((s) => s.students);
              const filtered = searchTerm
                ? allStudents.filter((st) =>
                    st.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    st.student_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    st.email?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                : null;

              return (
                <div key={yr.year_id} className="content-card" style={{ marginBottom: '1rem' }}>
                  <div
                    className="content-card-header"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setExpandedYears((e) => ({ ...e, [yr.year_id]: !e[yr.year_id] }))}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {expandedYears[yr.year_id] ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                      <BookOpen size={20} style={{ color: '#7c3aed' }} />
                      <h3 style={{ margin: 0 }}>{yr.year_name}</h3>
                      <span style={{ background: '#ede9fe', color: '#6d28d9', borderRadius: 20, padding: '2px 12px', fontSize: '0.78rem', fontWeight: 700 }}>
                        {allStudents.length} students
                      </span>
                    </div>
                  </div>

                  {expandedYears[yr.year_id] && (
                    <div style={{ padding: '0 0 0.5rem' }}>
                      {searchTerm ? (
                        // Show flat filtered results
                        <StudentTable students={filtered} />
                      ) : (
                        yr.sections.map((sec) => (
                          <div key={sec.section_id} style={{ marginBottom: '0.75rem' }}>
                            <div
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '0.5rem 1.25rem', cursor: 'pointer',
                                background: '#fafafa', borderTop: '1px solid #f1f5f9',
                              }}
                              onClick={() => setExpandedSections((e) => ({ ...e, [sec.section_id]: !e[sec.section_id] }))}
                            >
                              {expandedSections[sec.section_id] !== false ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              <UserCheck size={16} style={{ color: '#0ea5e9' }} />
                              <strong>Section {sec.section_name}</strong>
                              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Class Incharge: {sec.class_incharge || '—'}</span>
                              <span style={{ marginLeft: 'auto', background: '#e0f2fe', color: '#0369a1', borderRadius: 20, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600 }}>
                                {sec.student_count} students
                              </span>
                            </div>
                            {expandedSections[sec.section_id] !== false && (
                              <StudentTable students={sec.students} />
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

function StudentTable({ students }) {
  if (!students || students.length === 0) {
    return <p style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8', fontSize: '0.87rem' }}>No students found.</p>;
  }
  return (
    <div className="table-responsive" style={{ padding: '0 0.5rem' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Roll No.</th>
            <th>Email</th>
            {students[0]?.section && <th>Section</th>}
            <th>CGPA</th>
            <th>Arrears</th>
            <th>Accommodation</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, idx) => (
            <tr key={s.student_id || s.email}>
              <td style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{idx + 1}</td>
              <td><strong>{s.full_name}</strong></td>
              <td><span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#7c3aed', fontSize: '0.85rem' }}>{s.student_id}</span></td>
              <td style={{ fontSize: '0.82rem', color: '#64748b' }}>{s.email}</td>
              {s.section && <td><span style={{ background: '#ede9fe', color: '#6d28d9', padding: '1px 8px', borderRadius: 6, fontWeight: 700, fontSize: '0.8rem' }}>Sec {s.section}</span></td>}
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
  );
}
