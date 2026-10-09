import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  X,
  ShieldCheck,
  Clock,
  Copy,
  Check,
  Download,
  AlertTriangle,
  CheckCircle2,
  Lock,
  PlusCircle,
  CalendarClock,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import api from '../api';
import { formatDateTime, formatTimeOnly, formatCountdownClock, formatDuration, getPassTiming } from '../utils/dateUtils';

export default function QRPassModal({ pass, onClose, onPassUpdated }) {
  const canvasRef = useRef(null);
  const [currentPass, setCurrentPass] = useState(pass);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(new Date());

  // Extension state
  const [showExtendForm, setShowExtendForm] = useState(false);
  const [extendMinutes, setExtendMinutes] = useState(30);
  const [extendReason, setExtendReason] = useState('');
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState('');
  const [extendSuccess, setExtendSuccess] = useState('');

  // Keep internal pass in sync with prop changes
  useEffect(() => {
    if (pass) setCurrentPass(pass);
  }, [pass]);

  // Real-time second-by-second ticker for accurate activation and countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch full details (including pending extension requests) on modal open
  useEffect(() => {
    if (pass?.id) {
      api.get(`/gate-passes/${pass.id}`).then((res) => {
        setCurrentPass(res.data);
      }).catch(console.error);
    }
  }, [pass?.id]);

  const timing = getPassTiming(currentPass, now);

  useEffect(() => {
    if (canvasRef.current && (currentPass?.qr_token || currentPass?.gate_pass_id)) {
      const payload = currentPass.qr_token || currentPass.gate_pass_id;
      QRCode.toCanvas(canvasRef.current, payload, {
        width: 220,
        margin: 2,
        color: {
          dark: timing?.isEarly ? '#475569' : '#0f172a',
          light: '#ffffff',
        },
      });
    }
  }, [currentPass, timing?.isEarly]);

  if (!currentPass) return null;

  const handleCopyCode = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentPass.gate_pass_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadQR = () => {
    if (canvasRef.current) {
      const url = canvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `gatepass-${currentPass.gate_pass_id}-qr.png`;
      a.click();
    }
  };

  const handleExtendValidity = async (e) => {
    e?.preventDefault();
    setExtendError('');
    setExtendSuccess('');

    if (!extendReason.trim()) {
      setExtendError('Please provide a reason for extending your return time.');
      return;
    }
    if (!extendMinutes || extendMinutes < 5) {
      setExtendError('Please select or specify a valid extension time (minimum 5 minutes).');
      return;
    }

    try {
      setExtending(true);
      const res = await api.post(`/gate-passes/${currentPass.id}/request-extension`, {
        extension_minutes: parseInt(extendMinutes, 10),
        reason: extendReason.trim(),
      });

      const updated = {
        ...currentPass,
        pending_extension: {
          id: res.data.request_id,
          extension_minutes: res.data.extension_minutes,
          reason: res.data.reason,
          status: 'PENDING',
          created_at: res.data.created_at,
          projected_return_at: res.data.projected_return_at,
          projected_qr_expires_at: res.data.projected_qr_expires_at,
        },
      };

      setCurrentPass(updated);
      setExtendSuccess(res.data.message || `Extension request for +${extendMinutes}m submitted! Awaiting approval.`);
      setExtendReason('');
      setShowExtendForm(false);

      if (onPassUpdated) {
        onPassUpdated(updated);
      }
    } catch (err) {
      setExtendError(err.response?.data?.detail || 'Failed to submit extension request. Please try again.');
    } finally {
      setExtending(false);
    }
  };

  const handleCancelRequest = async (requestId) => {
    if (!requestId) return;
    try {
      setExtending(true);
      await api.post(`/extension-requests/${requestId}/cancel`);
      const updated = {
        ...currentPass,
        pending_extension: null,
      };
      setCurrentPass(updated);
      setExtendSuccess('Extension request cancelled.');
      if (onPassUpdated) {
        onPassUpdated(updated);
      }
    } catch (err) {
      setExtendError(err.response?.data?.detail || 'Failed to cancel extension request.');
    } finally {
      setExtending(false);
    }
  };

  // Compute preview times for extension
  const currentReturnMs = currentPass.return_at ? new Date(currentPass.return_at).getTime() : Date.now();
  const previewReturnDate = new Date(currentReturnMs + (parseInt(extendMinutes, 10) || 0) * 60 * 1000);
  const previewExpiryDate = new Date(previewReturnDate.getTime() + 30 * 60 * 1000);

  // Determine state
  const isEarly = timing?.isEarly && currentPass.status === 'QR_GENERATED';
  const isExpired = timing?.isExpired && currentPass.status !== 'RETURNED';
  const isActive = timing?.isActive && (currentPass.status === 'QR_GENERATED' || currentPass.status === 'EXITED');
  const canExtend = currentPass.status === 'QR_GENERATED' || currentPass.status === 'EXITED';


  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={22} color="#4f46e5" />
            <h3 style={{ margin: 0 }}>Anumathi Digital Gate Pass</h3>
          </div>
          <button className="btn-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {extendSuccess && (
          <div className="alert alert-success" style={{ marginBottom: 14 }}>
            <CheckCircle2 size={18} />
            <span>{extendSuccess}</span>
          </div>
        )}

        {/* Dynamic Status Notification Banner */}
        {isEarly && (
          <div
            style={{
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              color: '#92400e',
              padding: '12px 16px',
              borderRadius: 10,
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              border: '1px solid #fcd34d',
            }}
          >
            <Lock size={24} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                QR Activates 10 Mins Before Departure
              </div>
              <div style={{ fontSize: '0.78rem', marginTop: 2 }}>
                Activates in: <strong style={{ fontFamily: 'monospace', fontSize: '0.95rem' }}>{formatCountdownClock(timing.secondsUntilActivation)}</strong> (at {formatTimeOnly(timing.activationDate)})
              </div>
            </div>
          </div>
        )}

        {isActive && currentPass.status === 'QR_GENERATED' && (
          <div
            style={{
              background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
              color: '#065f46',
              padding: '12px 16px',
              borderRadius: 10,
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              border: '1px solid #a7f3d0',
            }}
          >
            <CheckCircle2 size={24} style={{ flexShrink: 0, color: '#10b981' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                QR Code Active Now
              </div>
              <div style={{ fontSize: '0.78rem', marginTop: 2 }}>
                Valid for exit until expected return + 30m grace window.
              </div>
              <div style={{ marginTop: 6, fontSize: '0.85rem', fontWeight: 700, background: '#a7f3d0', color: '#064e3b', display: 'inline-block', padding: '2px 8px', borderRadius: 6 }}>
                ⏱️ Expiring in: <span style={{ fontFamily: 'monospace' }}>{formatCountdownClock(timing.secondsUntilExpiry)}</span>
              </div>
            </div>
          </div>
        )}

        {currentPass.status === 'EXITED' && !isExpired && (
          <div
            style={{
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              color: '#1e40af',
              padding: '12px 16px',
              borderRadius: 10,
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              border: '1px solid #bfdbfe',
            }}
          >
            <Clock size={24} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                Campus Exited — Return Pending
              </div>
              <div style={{ fontSize: '0.78rem', marginTop: 2 }}>
                Return window closes in: <strong style={{ fontFamily: 'monospace' }}>{formatCountdownClock(timing.secondsUntilExpiry)}</strong>
              </div>
            </div>
          </div>
        )}

        {isExpired && (
          <div
            style={{
              background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
              color: '#991b1b',
              padding: '12px 16px',
              borderRadius: 10,
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              border: '1px solid #fecaca',
            }}
          >
            <AlertTriangle size={24} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                {currentPass.status === 'EXITED' ? '⚠️ Return Window Overdue' : '❌ Gate Pass Expired'}
              </div>
              <div style={{ fontSize: '0.78rem', marginTop: 2 }}>
                Expired 30 minutes after expected return ({formatDateTime(timing.expiryDate)}). Need more time? Use the Extend button below.
              </div>
            </div>
          </div>
        )}

        {/* QR Pass Card */}
        <div className="qr-pass-card" style={{ position: 'relative' }}>
          <div
            className="pass-id-pill"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            onClick={handleCopyCode}
            title="Click to copy Pass ID"
          >
            {currentPass.gate_pass_id}
            {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
          </div>
          <p style={{ fontSize: '0.82rem', color: '#c7d2fe', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            Anumathi — JNN INSTITUTE
          </p>

          <div className="qr-code-wrapper" style={{ position: 'relative' }}>
            <canvas ref={canvasRef} style={{ opacity: isEarly ? 0.45 : isExpired ? 0.35 : 1 }}></canvas>
            {isEarly && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(15, 23, 42, 0.75)',
                  borderRadius: 8,
                  color: '#ffffff',
                  padding: 12,
                  textAlign: 'center',
                }}
              >
                <Lock size={28} color="#fde047" style={{ marginBottom: 6 }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fde047' }}>
                  ACTIVATES 10 MINS BEFORE EXIT
                </span>
                <span style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: 2 }}>
                  Activates: {formatDateTime(timing.activationDate)}
                </span>
                <span style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'monospace', color: '#ffffff', marginTop: 4 }}>
                  {formatCountdownClock(timing.secondsUntilActivation)}
                </span>
              </div>
            )}
            {isExpired && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(15, 23, 42, 0.8)',
                  borderRadius: 8,
                  color: '#f87171',
                  padding: 12,
                  textAlign: 'center',
                }}
              >
                <AlertTriangle size={32} color="#f87171" style={{ marginBottom: 6 }} />
                <span style={{ fontSize: '0.92rem', fontWeight: 800 }}>EXPIRED</span>
                <span style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: 2 }}>
                  Return window closed
                </span>
              </div>
            )}
          </div>

          <div style={{ textAlign: 'left', background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '14px 16px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#cbd5e1' }}>Student:</span>
              <strong>{currentPass.student_name}</strong>
            </div>
            {currentPass.student_id && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#cbd5e1' }}>Roll No:</span>
                <span style={{ fontFamily: 'monospace' }}>{currentPass.student_id}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#cbd5e1' }}>Scheduled Departure:</span>
              <strong style={{ color: '#ffffff' }}>
                {formatDateTime(currentPass.exit_at)}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#cbd5e1' }}>QR Activation Time:</span>
              <strong style={{ color: isEarly ? '#fde047' : '#86efac' }}>
                {formatDateTime(timing?.activationDate)} (-10m)
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#cbd5e1' }}>Expected Return:</span>
              <div>
                <strong style={{ color: '#93c5fd' }}>
                  {formatDateTime(currentPass.return_at)}
                </strong>
                {currentPass.extension_count > 0 && (
                  <span style={{ marginLeft: 6, fontSize: '0.72rem', background: '#4338ca', color: '#e0e7ff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                    Extended ({currentPass.extension_count})
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#cbd5e1' }}>QR Pass Expires:</span>
              <span style={{ color: '#fca5a5', fontWeight: 600 }}>
                {formatDateTime(timing?.expiryDate)} (+30m)
              </span>
            </div>
            {isActive && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                <span style={{ color: '#fde047', fontWeight: 700 }}>⏳ Expiring In:</span>
                <strong style={{ color: '#fde047', fontFamily: 'monospace', fontSize: '0.95rem' }}>
                  {formatCountdownClock(timing.secondsUntilExpiry)}
                </strong>
              </div>
            )}
          </div>

          <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 14 }}>
            Show this QR pass at campus security checkpoints. Activates 10 minutes before scheduled departure time and expires 30 minutes after return time.
          </p>
        </div>

        {/* Pending Extension Request Banner */}
        {currentPass?.pending_extension && (
          <div style={{ marginTop: 14, background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: '12px 14px', color: '#92400e' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.88rem' }}>
                <Clock size={16} color="#d97706" />
                <span>Extension Request Pending Faculty Approval</span>
              </div>
              <span style={{ fontSize: '0.75rem', background: '#fef3c7', padding: '2px 8px', borderRadius: 8, fontWeight: 700, color: '#b45309' }}>
                +{currentPass.pending_extension.extension_minutes} Mins
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#78350f', lineHeight: 1.5 }}>
              <div><strong>Reason:</strong> {currentPass.pending_extension.reason}</div>
              <div><strong>Requested:</strong> {formatDateTime(currentPass.pending_extension.created_at)}</div>
              <div><strong>Proposed New Return:</strong> {formatDateTime(currentPass.pending_extension.projected_return_at || currentPass.pending_extension.new_return_at)}</div>
              <div style={{ marginTop: 6, color: '#b45309', fontWeight: 600, fontSize: '0.78rem' }}>
                ⏳ Awaiting approval from Class Incharge, HOD, or Principal.
              </div>
            </div>
            <div style={{ marginTop: 10, textAlign: 'right' }}>
              <button
                type="button"
                className="btn btn-sm"
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 12px',
                  background: '#fff',
                  border: '1px solid #f59e0b',
                  color: '#b45309',
                  cursor: 'pointer',
                  borderRadius: 6,
                }}
                disabled={extending}
                onClick={() => handleCancelRequest(currentPass.pending_extension.id)}
              >
                Cancel Request
              </button>
            </div>
          </div>
        )}

        {/* Extension Request Form / Accordion */}
        {canExtend && !currentPass?.pending_extension && (
          <div style={{ marginTop: 14, background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
              onClick={() => {
                setShowExtendForm(!showExtendForm);
                setExtendError('');
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4338ca', fontWeight: 700, fontSize: '0.9rem' }}>
                <CalendarClock size={18} />
                <span>Request Validity Extension</span>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                style={{ fontSize: '0.78rem', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                {showExtendForm ? <><ChevronUp size={14} /> Close</> : <><PlusCircle size={14} /> Request Extension</>}
              </button>
            </div>

            {showExtendForm && (
              <form onSubmit={handleExtendValidity} style={{ marginTop: 14 }}>
                <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 10px 0' }}>
                  Need more time? Submit a validity extension request. Your Class Incharge, HOD, or Principal will review and approve it (extensions of 1 hour or more are approved by faculty).
                </p>

                {extendError && (
                  <div className="alert alert-error" style={{ marginBottom: 10, fontSize: '0.82rem', padding: '8px 12px' }}>
                    <AlertTriangle size={15} />
                    <span>{extendError}</span>
                  </div>
                )}

                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
                  Select Extension Duration:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 12 }}>
                  {[
                    { label: '+30m', mins: 30 },
                    { label: '+45m', mins: 45 },
                    { label: '+1 Hour', mins: 60 },
                    { label: '+2 Hours', mins: 120 },
                    { label: '+3 Hours', mins: 180 },
                  ].map((preset) => (
                    <button
                      key={preset.mins}
                      type="button"
                      className={`btn btn-sm ${extendMinutes === preset.mins ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.76rem', padding: '6px 2px', fontWeight: 600 }}
                      onClick={() => setExtendMinutes(preset.mins)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569' }}>
                    Reason for Extension:
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Doctor appointment delayed, heavy road traffic, family emergency..."
                    value={extendReason}
                    onChange={(e) => setExtendReason(e.target.value)}
                    style={{ fontSize: '0.85rem' }}
                    required
                  />
                </div>

                {/* Preview Box */}
                <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: '#4338ca' }}>Proposed Return Time:</span>
                    <strong>{formatDateTime(previewReturnDate)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#4338ca' }}>Proposed QR Expiry (+30m):</span>
                    <strong style={{ color: '#059669' }}>{formatDateTime(previewExpiryDate)}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => setShowExtendForm(false)}
                    disabled={extending}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    disabled={extending}
                  >
                    {extending ? (
                      <><Loader2 size={14} className="spin" /> Submitting...</>
                    ) : (
                      <><Clock size={14} /> Submit Request (+{extendMinutes}m)</>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Extension History (if any) */}
        {currentPass?.extension_requests && currentPass.extension_requests.length > 0 && (
          <div style={{ marginTop: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>
              Extension Request History:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {currentPass.extension_requests.map((er) => (
                <div key={er.id} style={{ fontSize: '0.75rem', background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>+{er.extension_minutes}m</strong>: {er.reason}
                    {er.reviewed_by && <span style={{ color: '#64748b' }}> — Reviewed by {er.reviewed_by} ({er.reviewed_role})</span>}
                  </div>
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    background: er.status === 'APPROVED' ? '#dcfce7' : er.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                    color: er.status === 'APPROVED' ? '#15803d' : er.status === 'REJECTED' ? '#b91c1c' : '#b45309'
                  }}>
                    {er.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '0.6rem 0.5rem', fontSize: '0.82rem' }} onClick={handleCopyCode}>
            {copied ? <><Check size={15} color="#10b981" /> Copied</> : <><Copy size={15} /> Copy ID</>}
          </button>
          <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '0.6rem 0.5rem', fontSize: '0.82rem' }} onClick={handleDownloadQR}>
            <Download size={15} /> Download QR
          </button>
          <button className="btn btn-primary" style={{ flex: 1, padding: '0.6rem 0.5rem', fontSize: '0.82rem' }} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
