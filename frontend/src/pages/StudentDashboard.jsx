import React, { useState, useEffect } from 'react';
import { Plus, QrCode, Clock, CheckCircle2, AlertTriangle, ShieldCheck, X, Lock, Flame, Zap, AlertCircle } from 'lucide-react';
import api from '../api';
import Navbar from '../components/Navbar';
import ProfileModal from '../components/ProfileModal';
import QRPassModal from '../components/QRPassModal';
import MobileBottomNav from '../components/MobileBottomNav';
import { formatDateTime, formatTimeOnly, formatDuration, getPassTiming, toLocalDatetimeInputString } from '../utils/dateUtils';
import { requestNotificationPermission, sendMobileNotification } from '../utils/notifications';

export default function StudentDashboard() {
  const [user, setUser] = useState(null);
  const [passes, setPasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [activeQRPass, setActiveQRPass] = useState(null);
  const [now, setNow] = useState(new Date());

  // Form states
  const [reason, setReason] = useState('');
  const [exitAt, setExitAt] = useState('');
  const [returnAt, setReturnAt] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const prevStatusesRef = React.useRef({});

  const loadDashboardData = async (isBackground = false) => {
    try {
      const [meRes, passRes] = await Promise.all([
        api.get('/me'),
        api.get('/gate-passes'),
      ]);
      setUser(meRes.data);
      const newPasses = passRes.data || [];

      // Check for real-time status transitions to fire mobile notifications
      if (isBackground && newPasses.length > 0) {
        newPasses.forEach((p) => {
          const oldStatus = prevStatusesRef.current[p.id];
          if (oldStatus && oldStatus !== p.status) {
            if (p.status === 'QR_GENERATED' || p.status === 'APPROVED') {
              sendMobileNotification('Gate Pass Approved! 🎟️', {
                body: `Your gate pass for "${p.reason || 'Outing'}" has been approved! QR token is active.`,
              });
            } else if (p.status === 'EXITED') {
              sendMobileNotification('Exit Recorded 🚪', {
                body: `You have successfully exited campus. Return by ${formatTimeOnly(p.return_at)}.`,
              });
            } else if (p.status === 'RETURNED') {
              sendMobileNotification('Safe Return Logged ✅', {
                body: `Your return to campus has been recorded. Have a great day!`,
              });
            } else if (p.status === 'REJECTED') {
              sendMobileNotification('Gate Pass Update', {
                body: `Your pass request for "${p.reason || 'Outing'}" was not approved.`,
              });
            }
          }
          prevStatusesRef.current[p.id] = p.status;
        });
      } else {
        newPasses.forEach((p) => {
          prevStatusesRef.current[p.id] = p.status;
        });
      }

      setPasses(newPasses);
    } catch (err) {
      console.error('Failed to load student data', err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    requestNotificationPermission();

    // Real-time polling every 12 seconds for mobile push updates
    const pollInterval = setInterval(() => {
      loadDashboardData(true);
    }, 12000);
    return () => clearInterval(pollInterval);
  }, []);

  // Update clock every 5s so activation and expiry badges remain accurate
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(timer);
  }, []);

  const openNewPassModal = (emergency = false) => {
    setIsEmergency(emergency);
    setReason('');
    setEmergencyReason('');
    setFormError('');
    if (emergency) {
      const nowStr = toLocalDatetimeInputString();
      setExitAt(nowStr);
      // Default return in 3 hours for emergency
      const returnDate = new Date(Date.now() + 3 * 3600 * 1000);
      setReturnAt(toLocalDatetimeInputString(returnDate));
    } else {
      setExitAt('');
      setReturnAt('');
    }
    setShowRequestModal(true);
  };

  const handleCreatePass = async (e) => {
    e.preventDefault();
    setFormError('');
    if (user?.profile_completion < 100) {
      setFormError('Your profile is incomplete. Please complete your profile to 100% first.');
      return;
    }
    setSubmitting(true);
    try {
      const passReason = isEmergency
        ? (emergencyReason.trim() ? `[EMERGENCY] ${emergencyReason.trim()}` : reason.trim())
        : reason.trim();

      await api.post('/gate-passes', {
        reason: passReason,
        exit_at: new Date(exitAt).toISOString(),
        return_at: new Date(returnAt).toISOString(),
        is_emergency: isEmergency,
        emergency_reason: isEmergency ? (emergencyReason.trim() || reason.trim()) : null,
      });
      setShowRequestModal(false);
      setReason('');
      setEmergencyReason('');
      setIsEmergency(false);
      setExitAt('');
      setReturnAt('');
      loadDashboardData();
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to submit gate pass request.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (pass) => {
    const timing = getPassTiming(pass, now);
    let badgeEl = null;
    switch (pass.status) {
      case 'QR_GENERATED':
        if (timing?.isEarly) {
          badgeEl = (
            <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
              <Clock size={12} /> Activates at {formatTimeOnly(pass.exit_at)}
            </span>
          );
        } else if (timing?.isExpired) {
          badgeEl = (
            <span className="badge badge-rejected">
              <AlertTriangle size={12} /> Expired
            </span>
          );
        } else {
          badgeEl = (
            <span className="badge badge-qr" style={{ background: '#d1fae5', color: '#065f46', fontWeight: 600 }}>
              <CheckCircle2 size={12} /> QR Active
            </span>
          );
        }
        break;
      case 'EXITED':
        if (timing?.isExpired) {
          badgeEl = (
            <span className="badge badge-rejected" style={{ background: '#fee2e2', color: '#991b1b', fontWeight: 600 }}>
              <AlertTriangle size={12} /> Overdue Return
            </span>
          );
        } else {
          badgeEl = (
            <span className="badge badge-exited">
              <Clock size={12} /> Campus Exited
            </span>
          );
        }
        break;
      case 'RETURNED':
        badgeEl = <span className="badge badge-returned"><CheckCircle2 size={12} /> Returned</span>;
        break;
      case 'REJECTED':
        badgeEl = <span className="badge badge-rejected"><AlertTriangle size={12} /> Rejected</span>;
        break;
      default:
        badgeEl = <span className="badge badge-pending"><Clock size={12} /> {pass.status.replace('PENDING_', 'Pending ')}</span>;
    }

    if (pass.is_emergency) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <span style={{
            fontSize: '0.68rem',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: 6,
            background: '#fee2e2',
            color: '#dc2626',
            border: '1px solid #f87171',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            🚨 Emergency
          </span>
          {badgeEl}
        </div>
      );
    }
    return badgeEl;
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '5rem', color: '#64748b' }}>Loading dashboard...</div>;
  }

  const completion = user?.profile_completion || 0;
  const qrReadyCount = passes.filter((p) => {
    const timing = getPassTiming(p, now);
    return p.status === 'QR_GENERATED' && timing?.isActive;
  }).length;
  const pendingCount = passes.filter((p) => p.status.startsWith('PENDING')).length;

  return (
    <div>
      <Navbar user={user} onProfileClick={() => setShowProfileModal(true)} />

      <div className="dashboard-container">
        <div className="dashboard-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1>Welcome, {user?.name.split(' ')[0]}</h1>
              <span className={`badge ${completion === 100 ? 'badge-approved' : 'badge-pending'}`}>
                Profile: {completion}%
              </span>
              <span className="badge badge-qr" style={{ background: '#e0e7ff', color: '#3730a3', fontWeight: 600 }}>
                JNN INSTITUTE
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
              Student ID: <strong>{user?.student_id || 'N/A'}</strong> · JNN INSTITUTE — Anumathi
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn"
              style={{
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#ffffff',
                border: 'none',
                boxShadow: '0 2px 8px rgba(220, 38, 38, 0.35)',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              onClick={() => {
                if (completion < 100) {
                  setShowProfileModal(true);
                } else {
                  openNewPassModal(true);
                }
              }}
            >
              <Flame size={16} /> Request Emergency Pass
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (completion < 100) {
                  setShowProfileModal(true);
                } else {
                  openNewPassModal(false);
                }
              }}
            >
              <Plus size={16} /> Request Anumathi Pass
            </button>
          </div>
        </div>

        {completion < 100 && (
          <div className="alert alert-error" style={{ marginBottom: '1.5rem', cursor: 'pointer' }} onClick={() => setShowProfileModal(true)}>
            <AlertTriangle size={18} />
            <span>
              Your profile is only <strong>{completion}%</strong> complete. Department, academic year, section, and parent info are mandatory before requesting passes. <u>Click here to complete it now.</u>
            </span>
          </div>
        )}

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">
              <ShieldCheck size={24} />
            </div>
            <div className="stat-info">
              <p>Total Passes</p>
              <strong>{passes.length}</strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon warning">
              <Clock size={24} />
            </div>
            <div className="stat-info">
              <p>In Review</p>
              <strong>{pendingCount}</strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon success">
              <QrCode size={24} />
            </div>
            <div className="stat-info">
              <p>QR Pass Active</p>
              <strong>{qrReadyCount}</strong>
            </div>
          </div>
        </div>

        <div className="content-card">
          <div className="content-card-header">
            <h3>My Anumathi Passes</h3>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Showing all requests with real-time pass validity</span>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pass ID</th>
                  <th>Reason</th>
                  <th>Departure Time</th>
                  <th>Expected Return</th>
                  <th>QR Expiry (+30m)</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {passes.map((p) => {
                  const timing = getPassTiming(p, now);
                  return (
                    <tr key={p.id}>
                      <td>
                        <strong style={{ fontFamily: 'monospace', color: '#334155' }}>{p.gate_pass_id}</strong>
                      </td>
                      <td style={{ maxWidth: 220 }}>{p.reason}</td>
                      <td>
                        <strong>{formatDateTime(p.exit_at)}</strong>
                      </td>
                      <td>
                        <strong>{formatDateTime(p.return_at)}</strong>
                        {p.pending_extension && (
                          <span style={{ color: '#b45309', background: '#fef3c7', padding: '2px 6px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 3 }}>
                            <Clock size={11} /> Ext Req (+{p.pending_extension.extension_minutes}m)
                          </span>
                        )}
                        {p.extension_count > 0 && (
                          <span style={{ color: '#4338ca', fontSize: '0.72rem', fontWeight: 700, display: 'block', marginTop: 2 }}>
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
                        {timing?.isExpired && p.status !== 'RETURNED' && (
                          <span style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600, display: 'block', marginTop: 2 }}>
                            Expired
                          </span>
                        )}
                      </td>
                      <td>{getStatusBadge(p)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {(p.status === 'QR_GENERATED' || p.status === 'EXITED') ? (
                          <button
                            className={`btn btn-sm ${timing?.isEarly ? 'btn-secondary' : 'btn-primary'}`}
                            onClick={() => setActiveQRPass(p)}
                          >
                            {timing?.isEarly ? (
                              <><Lock size={13} /> View Pass</>
                            ) : (
                              <><QrCode size={13} /> View QR</>
                            )}
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Awaiting Approval</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {passes.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                      No passes requested yet. Click "Request Anumathi Pass" above to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Request Gate Pass Modal */}
      {showRequestModal && (
        <div className="modal-backdrop" onClick={() => setShowRequestModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isEmergency && <Flame size={20} color="#dc2626" />}
                <h3 style={{ margin: 0 }}>
                  {isEmergency ? 'Emergency Gate Pass Request' : 'Request Campus Exit — JNN INSTITUTE'}
                </h3>
              </div>
              <button className="btn-close" onClick={() => setShowRequestModal(false)}>
                <X size={20} />
              </button>
            </div>

            {/* Type selector toggle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '1rem 1.25rem 0.25rem' }}>
              <button
                type="button"
                onClick={() => {
                  setIsEmergency(false);
                }}
                style={{
                  padding: '0.6rem 0.75rem',
                  borderRadius: 8,
                  border: isEmergency ? '1px solid #e2e8f0' : '2px solid #2563eb',
                  background: isEmergency ? '#ffffff' : '#eff6ff',
                  color: isEmergency ? '#64748b' : '#1d4ed8',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                Standard Outing
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEmergency(true);
                  if (!exitAt) setExitAt(toLocalDatetimeInputString());
                  if (!returnAt) setReturnAt(toLocalDatetimeInputString(new Date(Date.now() + 3 * 3600 * 1000)));
                }}
                style={{
                  padding: '0.6rem 0.75rem',
                  borderRadius: 8,
                  border: isEmergency ? '2px solid #dc2626' : '1px solid #e2e8f0',
                  background: isEmergency ? '#fef2f2' : '#ffffff',
                  color: isEmergency ? '#dc2626' : '#64748b',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: 'all 0.15s',
                }}
              >
                <Flame size={15} /> Emergency Pass
              </button>
            </div>

            {/* Emergency Info Callout */}
            {isEmergency && (
              <div style={{
                margin: '0.75rem 1.25rem 0',
                padding: '0.85rem 1rem',
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                borderRadius: 10,
                fontSize: '0.82rem',
                color: '#9f1239',
                lineHeight: 1.5,
              }}>
                <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <AlertCircle size={15} color="#e11d48" /> Fast-Track Clearance Protocol
                </div>
                Your request will be alerted immediately to your <strong>Class Incharge, HOD, and Principal</strong>.
                As soon as <strong>either the HOD or Principal approves</strong>, your digital QR gate pass is issued instantly.
              </div>
            )}

            {formError && (
              <div className="alert alert-error" style={{ margin: '0.75rem 1.25rem 0' }}>
                <AlertTriangle size={18} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreatePass} style={{ padding: '1rem 1.25rem' }}>
              <div className="form-group">
                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{isEmergency ? 'Emergency Reason / Situation' : 'Reason for Leave'}</span>
                  {isEmergency && <span style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 700 }}>HIGH PRIORITY</span>}
                </label>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder={isEmergency ? "State the urgent reason (e.g. Medical emergency, urgent family situation, personal injury)..." : "Explain why you need to exit campus (e.g. Medical appointment, Family event)..."}
                  value={isEmergency ? emergencyReason : reason}
                  onChange={(e) => {
                    if (isEmergency) {
                      setEmergencyReason(e.target.value);
                      setReason(e.target.value);
                    } else {
                      setReason(e.target.value);
                    }
                  }}
                  required
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ margin: 0 }}>Departure Date & Time</label>
                  {isEmergency && (
                    <button
                      type="button"
                      onClick={() => setExitAt(toLocalDatetimeInputString())}
                      style={{
                        background: '#fee2e2',
                        border: '1px solid #fca5a5',
                        color: '#b91c1c',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ⚡ Leave Now
                    </button>
                  )}
                </div>
                <input
                  type="datetime-local"
                  className="form-control"
                  min={toLocalDatetimeInputString()}
                  value={exitAt}
                  onChange={(e) => setExitAt(e.target.value)}
                  required
                />
                <small style={{ color: isEmergency ? '#dc2626' : '#4f46e5', fontSize: '0.78rem', marginTop: 4, display: 'block', fontWeight: 500 }}>
                  {isEmergency ? '🚨 Emergency passes activate immediately once approved by HOD or Principal.' : '⚡ QR code activates 10 minutes before this departure time.'}
                </small>
              </div>

              <div className="form-group">
                <label>Expected Return Date & Time</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  min={exitAt || toLocalDatetimeInputString()}
                  value={returnAt}
                  onChange={(e) => setReturnAt(e.target.value)}
                  required
                />
                <small style={{ color: '#64748b', fontSize: '0.78rem', marginTop: 4, display: 'block' }}>
                  ⏱️ Pass remains valid and expires 30 minutes after return time.
                </small>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRequestModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  style={{
                    background: isEmergency ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : undefined,
                    color: isEmergency ? '#ffffff' : undefined,
                    border: 'none',
                    fontWeight: 700,
                  }}
                  disabled={submitting}
                >
                  {submitting ? 'Submitting...' : (isEmergency ? '🚨 Submit Emergency Request' : 'Submit Request')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showProfileModal && (
        <ProfileModal
          onClose={() => setShowProfileModal(false)}
          onProfileUpdated={(newCompletion) => {
            setUser((prev) => ({ ...prev, profile_completion: newCompletion }));
          }}
        />
      )}

      {/* QR Pass View Modal */}
      {activeQRPass && (
        <QRPassModal
          pass={activeQRPass}
          onClose={() => setActiveQRPass(null)}
          onPassUpdated={(updatedPass) => {
            setActiveQRPass(updatedPass);
            setPasses((prev) =>
              prev.map((item) => (item.id === updatedPass.id ? { ...item, ...updatedPass } : item))
            );
          }}
        />
      )}

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        onOpenNewPass={() => setShowRequestModal(true)}
        onOpenProfile={() => setShowProfileModal(true)}
      />
    </div>
  );
}
