import React, { useState, useEffect } from 'react';
import { Plus, QrCode, Clock, CheckCircle2, AlertTriangle, ShieldCheck, X, Lock } from 'lucide-react';
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

  const handleCreatePass = async (e) => {
    e.preventDefault();
    setFormError('');
    if (user?.profile_completion < 100) {
      setFormError('Your profile is incomplete. Please complete your profile to 100% first.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/gate-passes', {
        reason,
        exit_at: new Date(exitAt).toISOString(),
        return_at: new Date(returnAt).toISOString(),
      });
      setShowRequestModal(false);
      setReason('');
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
    switch (pass.status) {
      case 'QR_GENERATED':
        if (timing?.isEarly) {
          return (
            <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
              <Clock size={12} /> Activates at {formatTimeOnly(pass.exit_at)}
            </span>
          );
        }
        if (timing?.isExpired) {
          return (
            <span className="badge badge-rejected">
              <AlertTriangle size={12} /> Expired
            </span>
          );
        }
        return (
          <span className="badge badge-qr" style={{ background: '#d1fae5', color: '#065f46', fontWeight: 600 }}>
            <CheckCircle2 size={12} /> QR Active
          </span>
        );
      case 'EXITED':
        if (timing?.isExpired) {
          return (
            <span className="badge badge-rejected" style={{ background: '#fee2e2', color: '#991b1b', fontWeight: 600 }}>
              <AlertTriangle size={12} /> Overdue Return
            </span>
          );
        }
        return (
          <span className="badge badge-exited">
            <Clock size={12} /> Campus Exited
          </span>
        );
      case 'RETURNED':
        return <span className="badge badge-returned"><CheckCircle2 size={12} /> Returned</span>;
      case 'REJECTED':
        return <span className="badge badge-rejected"><AlertTriangle size={12} /> Rejected</span>;
      default:
        return <span className="badge badge-pending"><Clock size={12} /> {pass.status.replace('PENDING_', 'Pending ')}</span>;
    }
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

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (completion < 100) {
                  setShowProfileModal(true);
                } else {
                  setShowRequestModal(true);
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
              <h3>Request Campus Exit — JNN INSTITUTE Anumathi</h3>
              <button className="btn-close" onClick={() => setShowRequestModal(false)}>
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="alert alert-error">
                <AlertTriangle size={18} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreatePass}>
              <div className="form-group">
                <label>Reason for Leave</label>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder="Explain why you need to exit campus (e.g. Medical appointment, Family event, Official exam)..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Departure Date & Time</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  min={toLocalDatetimeInputString()}
                  value={exitAt}
                  onChange={(e) => setExitAt(e.target.value)}
                  required
                />
                <small style={{ color: '#4f46e5', fontSize: '0.78rem', marginTop: 4, display: 'block', fontWeight: 500 }}>
                  ⚡ QR code activates 10 minutes before this departure time.
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
                  ⏱️ QR pass will remain valid and expire 30 minutes after this return time.
                </small>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRequestModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Request'}
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
