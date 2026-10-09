import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Camera,
  Upload,
  RefreshCw,
  FileText,
  ScanLine,
  Lock,
  CalendarClock,
  PlusCircle,
  X,
  Check,
  Search,
  Download,
  Clock,
  Users,
  UserCheck,
} from 'lucide-react';
import api from '../api';
import Navbar from '../components/Navbar';
import MobileBottomNav from '../components/MobileBottomNav';
import { decodeQRFromImage } from '../utils/qrDecoder';
import { formatDateTime, formatTimeOnly, formatCountdownClock, getPassTiming } from '../utils/dateUtils';

export default function SecurityGate() {
  const [tokenInput, setTokenInput] = useState('');
  const [scannedPass, setScannedPass] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [user, setUser] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [activePasses, setActivePasses] = useState([]);

  // Confirmation dialog modal state: { type: 'EXIT' | 'RETURN', pass: object } | null
  const [confirmModal, setConfirmModal] = useState(null);

  // Persistent Gate Logs state
  const [gateLogs, setGateLogs] = useState([]);
  const [gateMetrics, setGateMetrics] = useState({
    currently_outside: 0,
    today_exits: 0,
    today_returns: 0,
    overdue_count: 0,
    total_all_time: 0,
  });
  const [logsLoading, setLogsLoading] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [logFilter, setLogFilter] = useState('ALL'); // 'ALL' | 'CURRENTLY_OUT' | 'EXIT' | 'RETURN'

  // Extension state
  const [showSecExtend, setShowSecExtend] = useState(false);
  const [secExtendMins, setSecExtendMins] = useState(30);
  const [secExtendReason, setSecExtendReason] = useState('Authorized by Campus Security/Warden');
  const [secExtending, setSecExtending] = useState(false);

  // Live clock — drives real-time expiry countdown on scanned pass
  const [now, setNow] = useState(new Date());

  // Scanner Mode: 'camera' | 'upload'
  const [scanMode, setScanMode] = useState('camera');
  const [cameraActive, setCameraActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [scanStatus, setScanStatus] = useState('');

  const html5QrCodeRef = useRef(null);
  const fileInputRef = useRef(null);

  const fetchPasses = async () => {
    try {
      const res = await api.get('/gate-passes');
      const passes = res.data || [];
      setActivePasses(passes.filter((p) => p.status === 'QR_GENERATED' || p.status === 'EXITED'));
    } catch (e) {
      console.log('Failed to fetch gate passes:', e);
    }
  };

  const fetchGateLogs = async (filter = logFilter, search = logSearch) => {
    try {
      setLogsLoading(true);
      const res = await api.get('/security/gate-logs', {
        params: {
          movement_filter: filter,
          search: search.trim() || undefined,
        },
      });
      setGateLogs(res.data.logs || []);
      if (res.data.metrics) {
        setGateMetrics(res.data.metrics);
      }
    } catch (e) {
      console.error('Failed to fetch gate logs:', e);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!gateLogs || gateLogs.length === 0) return;
    const headers = [
      'Log ID',
      'Pass Code',
      'Student Name',
      'Roll Number',
      'Department',
      'Reason',
      'Exit Time',
      'Return Time',
      'Duration (Mins)',
      'Movement Status',
      'Security Officer',
    ];
    const rows = gateLogs.map((l) => [
      l.id,
      l.pass_code,
      `"${(l.student_name || '').replace(/"/g, '""')}"`,
      l.student_id,
      `"${(l.department_name || '').replace(/"/g, '""')}"`,
      `"${(l.reason || '').replace(/"/g, '""')}"`,
      l.exit_at ? new Date(l.exit_at).toLocaleString() : '',
      l.return_at ? new Date(l.return_at).toLocaleString() : 'Currently Outside',
      l.duration_minutes ?? '',
      l.is_returned ? (l.is_overdue ? 'OVERDUE RETURN' : 'RETURNED') : 'CURRENTLY OUTSIDE',
      `"${(l.security_officer_name || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `gate_register_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    api.get('/me').then((res) => setUser(res.data)).catch(() => {});
    fetchPasses();
    fetchGateLogs();

    // 1-second ticker for live expiry / activation countdowns
    const ticker = setInterval(() => setNow(new Date()), 1000);

    return () => {
      stopCamera();
      clearInterval(ticker);
    };
  }, []);

  useEffect(() => {
    fetchGateLogs(logFilter, logSearch);
  }, [logFilter]);

  // Handle mode switches
  useEffect(() => {
    if (scanMode === 'upload') {
      stopCamera();
    }
  }, [scanMode]);

  const startCamera = async () => {
    setError('');
    setScanStatus('Starting camera...');
    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode('qr-reader-video');
      }
      await html5QrCodeRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          setScanStatus('Pass detected! Verifying...');
          verifyToken(decodedText);
          stopCamera();
        },
        () => {}
      );
      setCameraActive(true);
      setScanStatus('Point camera at student QR code');
    } catch (err) {
      console.error('Camera error:', err);
      setCameraActive(false);
      setScanStatus('');
      setError('Could not access camera. Please allow camera permissions or switch to the "Upload Image" tab.');
    }
  };

  const stopCamera = async () => {
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
      }
    } catch (e) {
      console.log('Camera stop error:', e);
    } finally {
      setCameraActive(false);
      setScanStatus('');
    }
  };

  const verifyToken = async (token) => {
    if (!token) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.post('/security/scan', { token: String(token).trim() });
      setScannedPass(res.data);
      setTokenInput(token);
      if (res.data.is_early) {
        setError(`⚠️ Pass not active yet: QR activates 10 minutes before scheduled exit (at ${formatDateTime(res.data.qr_activates_at || res.data.exit_at)}). Student cannot exit yet.`);
      } else if (res.data.is_expired && res.data.status === 'QR_GENERATED') {
        setError(`❌ Pass expired at ${formatDateTime(res.data.valid_until)} (30 mins after expected return). Exit blocked.`);
      } else if (res.data.is_expired && res.data.status === 'EXITED') {
        setError(`⚠️ OVERDUE RETURN: Student return window closed at ${formatDateTime(res.data.valid_until)} (30m grace period ended).`);
      } else {
        setSuccessMsg(res.data.status_message || `Pass recognized for ${res.data.student_name}`);
      }
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          'Pass token or code not found. Please verify the code or check if the pass was approved.'
      );
      setScannedPass(null);
    } finally {
      setLoading(false);
      setScanStatus('');
    }
  };

  const handleManualScan = (e) => {
    e.preventDefault();
    verifyToken(tokenInput);
  };

  const handleProcessFile = async (file) => {
    if (!file) return;
    setScanStatus('Analyzing image with multi-pass QR reader...');
    setError('');
    try {
      const code = await decodeQRFromImage(file);
      if (code) {
        setScanStatus('QR code detected! Verifying with server...');
        verifyToken(code);
      } else {
        setScanStatus('');
        setError(
          'Could not detect a clear QR code in this image. Tip: Use "Download QR" from the student pass modal, or click ⚡ Verify on the active pass below.'
        );
      }
    } catch (e) {
      console.error(e);
      setScanStatus('');
      setError('Failed to process image file.');
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleProcessFile(e.target.files[0]);
    }
  };

  const handleRecordExit = async () => {
    if (!scannedPass) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post(`/security/${scannedPass.gate_pass_id}/exit`);
      setSuccessMsg(`✓ Student EXIT recorded: ${scannedPass.student_name} (${scannedPass.student_id})`);
      setRecentScans((prev) => [
        {
          id: Date.now(),
          student_name: scannedPass.student_name,
          student_id: scannedPass.student_id,
          pass_code: scannedPass.pass_code,
          action: 'EXIT',
          time: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
      setScannedPass((prev) => ({ ...prev, status: 'EXITED' }));
      fetchPasses();
      fetchGateLogs();
      setConfirmModal(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to record exit.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecordReturn = async () => {
    if (!scannedPass) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post(`/security/${scannedPass.gate_pass_id}/return`);
      setSuccessMsg(`✓ Student RETURN recorded: ${scannedPass.student_name} (${scannedPass.student_id})`);
      setRecentScans((prev) => [
        {
          id: Date.now(),
          student_name: scannedPass.student_name,
          student_id: scannedPass.student_id,
          pass_code: scannedPass.pass_code,
          action: 'RETURN',
          time: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
      setScannedPass((prev) => ({ ...prev, status: 'RETURNED' }));
      fetchPasses();
      fetchGateLogs();
      setConfirmModal(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to record return.');
    } finally {
      setLoading(false);
    }
  };

  const handleSecurityExtend = async (e) => {
    e?.preventDefault();
    if (!scannedPass) return;
    const mins = parseInt(secExtendMins, 10);
    if (mins > 45) {
      setError('Security officers can only extend validity up to 45 minutes (30 or 45 mins). Extensions of 1 hour or more require faculty approval.');
      return;
    }
    setSecExtending(true);
    setError('');
    try {
      const res = await api.post(`/gate-passes/${scannedPass.gate_pass_id}/extend`, {
        extension_minutes: mins,
        reason: secExtendReason || 'Authorized extension by Campus Security',
      });
      setSuccessMsg(`✓ Pass validity successfully extended by ${mins} minutes! New return: ${formatDateTime(res.data.return_at)}`);
      setScannedPass((prev) => ({
        ...prev,
        return_at: res.data.return_at,
        valid_until: res.data.valid_until,
        is_active: res.data.is_active,
        is_expired: res.data.is_expired,
        extension_count: res.data.extension_count,
        seconds_until_expiry: res.data.seconds_until_expiry,
      }));
      setShowSecExtend(false);
      fetchPasses();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to extend pass validity.');
    } finally {
      setSecExtending(false);
    }
  };

  // Compute live timing for scanned pass (re-computed every render via the `now` ticker)
  const liveTiming = scannedPass ? getPassTiming(scannedPass, now) : null;
  const liveIsEarly = liveTiming?.isEarly ?? scannedPass?.is_early ?? false;
  const liveIsExpired = liveTiming?.isExpired ?? scannedPass?.is_expired ?? false;
  const liveIsActive = liveTiming?.isActive ?? scannedPass?.is_active ?? false;

  return (
    <div>
      <Navbar user={user} />

      <div className="dashboard-container">
        <div className="dashboard-header">
          <div>
            <h1>JNN INSTITUTE — Gate Security Checkpoint</h1>
            <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
              Scan dynamic QR codes or verify Anumathi pass tokens to authenticate campus exit and entry
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(340px, 450px) 1fr',
            gap: '2rem',
            alignItems: 'start',
          }}
        >
          {/* Scanner Panel */}
          <div className="content-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <QrCode size={20} color="#4f46e5" />
                QR Gate Scanner
              </h3>

              {/* Mode Tabs */}
              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 3, gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setScanMode('camera')}
                  style={{
                    border: 'none',
                    background: scanMode === 'camera' ? '#ffffff' : 'transparent',
                    color: scanMode === 'camera' ? '#1e293b' : '#64748b',
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    boxShadow: scanMode === 'camera' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <Camera size={14} /> Camera
                </button>
                <button
                  type="button"
                  onClick={() => setScanMode('upload')}
                  style={{
                    border: 'none',
                    background: scanMode === 'upload' ? '#ffffff' : 'transparent',
                    color: scanMode === 'upload' ? '#1e293b' : '#64748b',
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    boxShadow: scanMode === 'upload' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <Upload size={14} /> Upload Image
                </button>
              </div>
            </div>

            {/* Camera Mode View */}
            {scanMode === 'camera' && (
              <div>
                <div
                  id="qr-reader-video"
                  style={{
                    width: '100%',
                    minHeight: 220,
                    background: '#0f172a',
                    borderRadius: 12,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#94a3b8',
                  }}
                >
                  {!cameraActive && (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                      <Camera size={40} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
                      <p style={{ margin: 0, fontSize: '0.85rem' }}>Camera scanner is currently idle</p>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '0.75rem', display: 'flex', gap: 8 }}>
                  {!cameraActive ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ width: '100%', padding: '0.65rem' }}
                      onClick={startCamera}
                    >
                      <ScanLine size={16} /> Start Camera Scanner
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: '100%', padding: '0.65rem' }}
                      onClick={stopCamera}
                    >
                      Stop Camera
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Upload Mode View */}
            {scanMode === 'upload' && (
              <div>
                <div
                  style={{
                    border: isDragging ? '2px dashed #4f46e5' : '2px dashed #cbd5e1',
                    borderRadius: 12,
                    padding: '2.25rem 1rem',
                    textAlign: 'center',
                    background: isDragging ? '#eff6ff' : '#f8fafc',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={36} color="#4f46e5" style={{ margin: '0 auto 10px' }} />
                  <strong style={{ display: 'block', fontSize: '0.92rem', color: '#1e293b' }}>
                    Click or Drag QR Pass Image Here
                  </strong>
                  <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '6px 0 0' }}>
                    Supports full screenshots, downloaded QR images, and camera photos
                  </p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={handleFileSelect}
                  />
                </div>
              </div>
            )}

            {/* Status indicator */}
            {scanStatus && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: '0.8rem',
                  color: '#4338ca',
                  background: '#e0e7ff',
                  padding: '6px 12px',
                  borderRadius: 6,
                  textAlign: 'center',
                  fontWeight: 500,
                }}
              >
                {scanStatus}
              </div>
            )}

            {/* Manual input */}
            <form onSubmit={handleManualScan} style={{ marginTop: '1.25rem' }}>
              <div className="form-group">
                <label>Or Enter Pass ID / Roll No / Token</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-control"
                    placeholder="e.g. GP-2026-217735 or 110723102021"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    required
                  />
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    Verify
                  </button>
                </div>
                <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                  💡 Guard can verify by entering Roll Number, Pass Code, or clicking ⚡ Verify below.
                </small>
              </div>
            </form>

            {/* Active Passes Queue for Demo / Quick Verification */}
            <div style={{ marginTop: '1.25rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                  ⚡ Active Passes Ready to Verify ({activePasses.length})
                </span>
                <button
                  type="button"
                  onClick={fetchPasses}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#4f46e5',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>

              {activePasses.length === 0 ? (
                <div
                  style={{
                    padding: '0.85rem',
                    background: '#f8fafc',
                    borderRadius: 8,
                    fontSize: '0.8rem',
                    color: '#94a3b8',
                    textAlign: 'center',
                  }}
                >
                  No passes awaiting verification right now.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
                  {activePasses.map((p) => {
                    const timing = getPassTiming(p);
                    return (
                      <div
                        key={p.id}
                        style={{
                          padding: '10px 12px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <div style={{ overflow: 'hidden' }}>
                          <strong style={{ fontSize: '0.85rem', display: 'block', color: '#0f172a' }}>
                            {p.student_name}
                          </strong>
                          <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                            {p.gate_pass_id} • {p.student_id}
                          </span>
                          <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 2 }}>
                            {p.status === 'QR_GENERATED' ? (
                              timing?.isEarly ? (
                                <span style={{ color: '#b45309', fontWeight: 600 }}>
                                  ⏳ Activates at {formatTimeOnly(timing?.activationDate || p.exit_at)}
                                </span>
                              ) : timing?.isExpired ? (
                                <span style={{ color: '#dc2626', fontWeight: 600 }}>🔴 Expired</span>
                              ) : (
                                <span style={{ color: '#059669', fontWeight: 600 }}>🟢 Active Now</span>
                              )
                            ) : (
                              <span style={{ color: '#2563eb', fontWeight: 600 }}>
                                🚶 Exited (Return by {formatTimeOnly(p.return_at)})
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: '0.75rem', padding: '5px 12px', whiteSpace: 'nowrap' }}
                          onClick={() => verifyToken(p.gate_pass_id)}
                        >
                          ⚡ Verify
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Verification Results Panel */}
          <div>
            {error && (
              <div className="alert alert-error">
                <AlertTriangle size={20} />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="alert alert-success">
                <CheckCircle2 size={20} />
                <span>{successMsg}</span>
              </div>
            )}

            {scannedPass ? (
              <div
                className="content-card"
                style={{
                  border: liveIsEarly
                    ? '2px solid #f59e0b'
                    : liveIsExpired && scannedPass.status === 'QR_GENERATED'
                    ? '2px solid #ef4444'
                    : liveIsExpired
                    ? '2px solid #f97316'
                    : '2px solid #10b981',
                  background: '#ffffff',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.25rem',
                  }}
                >
                  <div>
                    {liveIsEarly ? (
                      <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.85rem' }}>
                        <Lock size={14} /> NOT ACTIVE YET
                      </span>
                    ) : liveIsExpired && scannedPass.status === 'QR_GENERATED' ? (
                      <span className="badge badge-rejected" style={{ fontSize: '0.85rem' }}>
                        <AlertTriangle size={14} /> PASS EXPIRED
                      </span>
                    ) : liveIsExpired && scannedPass.status === 'EXITED' ? (
                      <span className="badge" style={{ background: '#fee2e2', color: '#991b1b', fontSize: '0.85rem' }}>
                        <AlertTriangle size={14} /> OVERDUE RETURN (&gt;30m)
                      </span>
                    ) : (
                      <span className="badge badge-approved" style={{ fontSize: '0.85rem' }}>
                        <CheckCircle2 size={14} /> VALID VERIFIED PASS
                      </span>
                    )}
                  </div>
                  <strong style={{ fontFamily: 'monospace', fontSize: '1.1rem', color: '#1e293b' }}>
                    {scannedPass.pass_code}
                  </strong>
                </div>

                {/* Emergency Pass Priority Banner */}
                {scannedPass.is_emergency && (
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      color: '#ffffff',
                      padding: '10px 14px',
                      borderRadius: 8,
                      marginBottom: '1rem',
                      fontSize: '0.88rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1.2rem' }}>🚨</span>
                      <div>
                        <strong>EMERGENCY GATE PASS — PRIORITY CLEARANCE</strong>
                        <div style={{ fontSize: '0.78rem', opacity: 0.95 }}>
                          Authorized by HOD / Principal. Immediate exit permitted.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status Callout Banner */}
                {liveIsEarly && (
                  <div
                    style={{
                      background: '#fffbeb',
                      border: '1px solid #fcd34d',
                      color: '#92400e',
                      padding: '10px 14px',
                      borderRadius: 8,
                      marginBottom: '1rem',
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Lock size={18} style={{ flexShrink: 0 }} />
                    <div>
                      <strong>Pass is not active yet!</strong> QR activates 10 minutes before scheduled exit: 
                      <strong>{formatDateTime(scannedPass.qr_activates_at || scannedPass.exit_at)}</strong> (in 
                      {formatCountdownClock(liveTiming?.secondsUntilActivation ?? 0)}). Student cannot exit before this time.
                    </div>
                  </div>
                )}

                {liveIsExpired && scannedPass.status === 'QR_GENERATED' && (
                  <div
                    style={{
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#991b1b',
                      padding: '10px 14px',
                      borderRadius: 8,
                      marginBottom: '1rem',
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                    <div>
                      <strong>Pass has expired!</strong> Valid window ended 30 minutes after expected return ({formatDateTime(scannedPass.valid_until)}). Exit not permitted.
                    </div>
                  </div>
                )}

                {liveIsExpired && scannedPass.status === 'EXITED' && (
                  <div
                    style={{
                      background: '#fff7ed',
                      border: '1px solid #fed7aa',
                      color: '#9a3412',
                      padding: '10px 14px',
                      borderRadius: 8,
                      marginBottom: '1rem',
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                    <div>
                      <strong>Student return is overdue!</strong> Student exceeded the 30-minute window past expected return ({formatDateTime(scannedPass.valid_until)}). Return will be recorded as overdue.
                    </div>
                  </div>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '1rem',
                    background: '#f8fafc',
                    padding: '1.25rem',
                    borderRadius: 12,
                    marginBottom: '1.5rem',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase' }}>
                      Student Name
                    </span>
                    <h4 style={{ fontSize: '1.15rem', color: '#0f172a', margin: '4px 0 0' }}>
                      {scannedPass.student_name}
                    </h4>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase' }}>
                      Roll Number
                    </span>
                    <h4
                      style={{
                        fontSize: '1.15rem',
                        fontFamily: 'monospace',
                        color: '#0f172a',
                        margin: '4px 0 0',
                      }}
                    >
                      {scannedPass.student_id}
                    </h4>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase' }}>
                      Purpose of Leave
                    </span>
                    <p style={{ margin: '4px 0 0', fontWeight: 500 }}>{scannedPass.reason}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase' }}>
                      Exact Departure Time
                    </span>
                    <strong style={{ display: 'block', marginTop: 2, color: scannedPass.is_early ? '#b45309' : '#0f172a' }}>
                      {formatDateTime(scannedPass.exit_at)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase' }}>
                      Expected Return Time
                    </span>
                    <strong style={{ display: 'block', marginTop: 2, color: '#1d4ed8' }}>
                      {formatDateTime(scannedPass.return_at)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase' }}>
                      QR Expiry (+30m Window)
                    </span>
                    <strong style={{ display: 'block', marginTop: 2, color: scannedPass.is_expired ? '#dc2626' : '#059669' }}>
                      {formatDateTime(scannedPass.valid_until)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase' }}>
                      Expiring In / Time Status
                    </span>
                    <div style={{ marginTop: 2 }}>
                      {liveIsEarly ? (
                        <span style={{ color: '#b45309', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.88rem' }}>
                          Activates in: {formatCountdownClock(liveTiming?.secondsUntilActivation ?? 0)}
                        </span>
                      ) : liveIsExpired ? (
                        <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.88rem' }}>
                          Expired
                        </span>
                      ) : (
                        <span style={{ color: '#059669', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.88rem', background: '#d1fae5', padding: '2px 8px', borderRadius: 4 }}>
                          ⏱️ Expiring in: {formatCountdownClock(liveTiming?.secondsUntilExpiry ?? 0)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase' }}>
                      Gate Status
                    </span>
                    <div style={{ marginTop: 2 }}>
                      <span
                        className={`badge ${
                          scannedPass.status === 'QR_GENERATED'
                            ? scannedPass.is_early
                              ? 'badge-pending'
                              : 'badge-approved'
                            : scannedPass.status === 'EXITED'
                            ? 'badge-exited'
                            : 'badge-returned'
                        }`}
                      >
                        {scannedPass.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Security Pass Extension Section */}
                {(scannedPass.status === 'QR_GENERATED' || scannedPass.status === 'EXITED') && (
                  <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 10, padding: '10px 14px', marginBottom: '1.25rem' }}>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => setShowSecExtend(!showSecExtend)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                        <CalendarClock size={16} color="#4f46e5" />
                        <span>Extend Pass Validity</span>
                        {scannedPass.extension_count > 0 && (
                          <span style={{ fontSize: '0.72rem', background: '#e0e7ff', color: '#4338ca', padding: '1px 6px', borderRadius: 4 }}>
                            Extended ({scannedPass.extension_count})
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowSecExtend(!showSecExtend);
                        }}
                      >
                        {showSecExtend ? 'Hide' : '+ Extend Time'}
                      </button>
                    </div>

                    {showSecExtend && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: '0.74rem', color: '#64748b', marginBottom: 8, lineHeight: 1.4 }}>
                          Security officers can grant extensions of <strong>30 mins</strong> or <strong>45 mins</strong> (max 45 mins). Extensions of 1 hour or more must be requested by the student and approved by Class Incharge, HOD, or Principal.
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                          {[30, 45].map((mins) => (
                            <button
                              key={mins}
                              type="button"
                              className={`btn btn-sm ${secExtendMins === mins ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ fontSize: '0.75rem', padding: '4px 12px', fontWeight: 600 }}
                              onClick={() => setSecExtendMins(mins)}
                            >
                              +{mins} mins
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Reason (e.g. Approved via phone with Hostel Warden/Incharge)"
                          value={secExtendReason}
                          onChange={(e) => setSecExtendReason(e.target.value)}
                          style={{ fontSize: '0.82rem', marginBottom: 8 }}
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ width: '100%', fontSize: '0.82rem' }}
                          disabled={secExtending}
                          onClick={handleSecurityExtend}
                        >
                          {secExtending ? 'Extending...' : `Confirm +${secExtendMins}m Extension`}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Gate Action Buttons */}
                <div style={{ display: 'flex', gap: 12 }}>
                  {scannedPass.status === 'QR_GENERATED' && (
                    liveIsEarly ? (
                      <button
                        className="btn btn-secondary"
                        style={{ flex: 1, padding: '0.9rem', cursor: 'not-allowed', opacity: 0.7 }}
                        disabled
                        title="Pass is not active yet. QR activates 10 minutes before the scheduled exit time."
                      >
                        <Lock size={18} /> Exit Locked — Activates at {formatTimeOnly(scannedPass.qr_activates_at || new Date(new Date(scannedPass.exit_at).getTime() - 10 * 60000))}
                        &nbsp;({formatCountdownClock(liveTiming?.secondsUntilActivation ?? 0)})
                      </button>
                    ) : liveIsExpired ? (
                      <button
                        className="btn btn-secondary"
                        style={{ flex: 1, padding: '0.9rem', cursor: 'not-allowed', opacity: 0.7 }}
                        disabled
                      >
                        <AlertTriangle size={18} /> Exit Denied (Pass Expired)
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary"
                        style={{ flex: 1, padding: '0.9rem' }}
                        disabled={loading}
                        onClick={() => setConfirmModal({ type: 'EXIT', pass: scannedPass })}
                      >
                        <ArrowRight size={18} /> Confirm Student Exit
                      </button>
                    )
                  )}

                  {scannedPass.status === 'EXITED' && (
                    <button
                      className={liveIsExpired ? 'btn btn-warning' : 'btn btn-success'}
                      style={{
                        flex: 1,
                        padding: '0.9rem',
                        ...(liveIsExpired ? { background: '#d97706', color: '#ffffff' } : {}),
                      }}
                      disabled={loading}
                      onClick={() => setConfirmModal({ type: 'RETURN', pass: scannedPass })}
                    >
                      <ArrowLeft size={18} />{' '}
                      {liveIsExpired ? 'Confirm Student Return (Flagged Overdue)' : 'Confirm Student Enter / Return'}
                    </button>
                  )}

                  {scannedPass.status === 'RETURNED' && (
                    <div
                      style={{
                        textAlign: 'center',
                        width: '100%',
                        padding: '0.5rem',
                        color: '#059669',
                        fontWeight: 600,
                      }}
                    >
                      ✓ Pass completed. Student has returned to campus.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                className="content-card"
                style={{ textAlign: 'center', padding: '3.5rem 2rem', color: '#94a3b8' }}
              >
                <ShieldCheck size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                <h3>Awaiting Anumathi Pass Verification</h3>
                <p style={{ maxWidth: 360, margin: '0.5rem auto 0', fontSize: '0.9rem' }}>
                  Point the camera at a student QR pass, upload a pass image, or click Verify on any active pass.
                </p>
              </div>
            )}

          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* OFFICIAL CAMPUS GATE REGISTER & PERSISTENT MOVEMENT LOG           */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div style={{ marginTop: '2.5rem' }}>
          {/* Summary Metric Counters */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <div
              className="content-card"
              style={{
                padding: '1.25rem',
                borderLeft: '4px solid #3b82f6',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Users size={22} />
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                  Currently Outside
                </span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.1, marginTop: 2 }}>
                  {gateMetrics.currently_outside}
                </div>
              </div>
            </div>

            <div
              className="content-card"
              style={{
                padding: '1.25rem',
                borderLeft: '4px solid #ef4444',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: '#fef2f2',
                  color: '#dc2626',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <ArrowRight size={22} />
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                  Total Exits Logged
                </span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.1, marginTop: 2 }}>
                  {gateMetrics.today_exits}
                </div>
              </div>
            </div>

            <div
              className="content-card"
              style={{
                padding: '1.25rem',
                borderLeft: '4px solid #10b981',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: '#ecfdf5',
                  color: '#059669',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <ArrowLeft size={22} />
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                  Total Returns Logged
                </span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.1, marginTop: 2 }}>
                  {gateMetrics.today_returns}
                </div>
              </div>
            </div>

            <div
              className="content-card"
              style={{
                padding: '1.25rem',
                borderLeft: '4px solid #f59e0b',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: '#fffbeb',
                  color: '#d97706',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <AlertTriangle size={22} />
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                  Overdue Returns
                </span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: gateMetrics.overdue_count > 0 ? '#d97706' : '#1e293b', lineHeight: 1.1, marginTop: 2 }}>
                  {gateMetrics.overdue_count}
                </div>
              </div>
            </div>
          </div>

          {/* Main Gate Register Card */}
          <div className="content-card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '1rem',
                marginBottom: '1.25rem',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '1rem',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldCheck size={22} color="#4f46e5" />
                  Official Campus Gate Register &amp; Movement Log
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                  Persistent real-time ledger of campus student departures and entries recorded at security checkpoints.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => fetchGateLogs(logFilter, logSearch)}
                  disabled={logsLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <RefreshCw size={13} className={logsLoading ? 'spin' : ''} />
                  {logsLoading ? 'Updating...' : 'Refresh Register'}
                </button>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleExportCSV}
                  disabled={gateLogs.length === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                  title="Download CSV export of this gate movement ledger"
                >
                  <Download size={13} />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}
            >
              {/* Filter Tabs */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${logFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.78rem', padding: '5px 12px' }}
                  onClick={() => setLogFilter('ALL')}
                >
                  All Movements ({gateMetrics.total_all_time})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${logFilter === 'CURRENTLY_OUT' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    fontSize: '0.78rem',
                    padding: '5px 12px',
                    ...(logFilter !== 'CURRENTLY_OUT' && gateMetrics.currently_outside > 0
                      ? { borderColor: '#3b82f6', color: '#2563eb' }
                      : {}),
                  }}
                  onClick={() => setLogFilter('CURRENTLY_OUT')}
                >
                  🚶 Currently Outside ({gateMetrics.currently_outside})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${logFilter === 'EXIT' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.78rem', padding: '5px 12px' }}
                  onClick={() => setLogFilter('EXIT')}
                >
                  🔴 Exits
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${logFilter === 'RETURN' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.78rem', padding: '5px 12px' }}
                  onClick={() => setLogFilter('RETURN')}
                >
                  🟢 Returns
                </button>
              </div>

              {/* Search Box */}
              <div style={{ position: 'relative', width: '100%', maxWidth: 320 }}>
                <Search
                  size={15}
                  color="#94a3b8"
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search student, roll no, or pass ID..."
                  value={logSearch}
                  onChange={(e) => {
                    setLogSearch(e.target.value);
                    fetchGateLogs(logFilter, e.target.value);
                  }}
                  style={{ paddingLeft: 32, fontSize: '0.82rem', height: 36 }}
                />
                {logSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogSearch('');
                      fetchGateLogs(logFilter, '');
                    }}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Status &amp; Movement</th>
                    <th>Student Name &amp; ID</th>
                    <th>Dept</th>
                    <th>Pass ID &amp; Purpose</th>
                    <th>Exit Logged</th>
                    <th>Return Logged</th>
                    <th>Time Outside</th>
                    <th>Security Officer</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {gateLogs.map((l) => {
                    const isOutside = !l.is_returned;
                    const durationText =
                      l.duration_minutes != null
                        ? l.duration_minutes < 60
                          ? `${l.duration_minutes}m`
                          : `${Math.floor(l.duration_minutes / 60)}h ${l.duration_minutes % 60}m`
                        : '—';

                    return (
                      <tr key={l.id} style={isOutside ? { background: '#f8fafc' } : {}}>
                        <td>
                          {isOutside ? (
                            l.is_overdue ? (
                              <span
                                className="badge"
                                style={{
                                  background: '#fee2e2',
                                  color: '#991b1b',
                                  fontWeight: 700,
                                  fontSize: '0.74rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <AlertTriangle size={12} /> OUTSIDE (OVERDUE)
                              </span>
                            ) : (
                              <span
                                className="badge"
                                style={{
                                  background: '#dbeafe',
                                  color: '#1d4ed8',
                                  fontWeight: 700,
                                  fontSize: '0.74rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <ArrowRight size={12} /> CURRENTLY OUTSIDE
                              </span>
                            )
                          ) : l.is_overdue ? (
                            <span
                              className="badge"
                              style={{
                                background: '#fef3c7',
                                color: '#92400e',
                                fontWeight: 700,
                                fontSize: '0.74rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <CheckCircle2 size={12} /> RETURNED (OVERDUE)
                            </span>
                          ) : (
                            <span className="badge badge-returned" style={{ fontSize: '0.74rem' }}>
                              <CheckCircle2 size={12} /> RETURNED
                            </span>
                          )}
                        </td>

                        <td>
                          <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>
                            {l.student_name}
                          </div>
                          <span style={{ fontFamily: 'monospace', color: '#64748b', fontSize: '0.78rem' }}>
                            {l.student_id}
                          </span>
                        </td>

                        <td>
                          <span style={{ fontSize: '0.78rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                            {l.department_name}
                          </span>
                        </td>

                        <td style={{ maxWidth: 220 }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#334155', display: 'block', fontSize: '0.8rem' }}>
                            {l.pass_code}
                          </span>
                          <span style={{ fontSize: '0.76rem', color: '#64748b', display: 'block', marginTop: 2 }}>
                            {l.reason}
                          </span>
                        </td>

                        <td>
                          <strong style={{ fontSize: '0.82rem', color: '#0f172a' }}>
                            {formatDateTime(l.exit_at)}
                          </strong>
                        </td>

                        <td>
                          {l.return_at ? (
                            <strong style={{ fontSize: '0.82rem', color: l.is_overdue ? '#b45309' : '#059669' }}>
                              {formatDateTime(l.return_at)}
                            </strong>
                          ) : (
                            <span style={{ fontSize: '0.78rem', color: '#2563eb', fontWeight: 600 }}>
                              Expected: {formatTimeOnly(l.scheduled_return_at)}
                            </span>
                          )}
                        </td>

                        <td>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                            {durationText}
                          </span>
                        </td>

                        <td>
                          <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                            {l.security_officer_name}
                          </span>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          {isOutside ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              style={{ fontSize: '0.75rem', padding: '4px 10px', background: '#059669', borderColor: '#059669', color: '#ffffff' }}
                              onClick={() => verifyToken(l.pass_code)}
                              title="Load pass into verification panel to log return"
                            >
                              ⚡ Process Return
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                              onClick={() => verifyToken(l.pass_code)}
                            >
                              Inspect
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {gateLogs.length === 0 && (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#94a3b8' }}>
                        <ShieldCheck size={36} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#64748b' }}>
                          No gate movements found matching the current filter.
                        </div>
                        <p style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>
                          When students exit or return through the gate, official logs are permanently preserved here.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Security Reconfirmation Dialog Modal (Double Confirmation for Exit & Enter) */}
      {confirmModal && (
        <div className="modal-backdrop" onClick={() => !loading && setConfirmModal(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 480,
              padding: '1.75rem',
              borderRadius: 16,
              border: confirmModal.type === 'EXIT' ? '2px solid #3b82f6' : '2px solid #10b981',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            {/* Modal Header with Title and Close X Button */}
            <div
              className="modal-header"
              style={{
                marginBottom: '1rem',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: confirmModal.type === 'EXIT' ? '#eff6ff' : '#ecfdf5',
                    color: confirmModal.type === 'EXIT' ? '#2563eb' : '#059669',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {confirmModal.type === 'EXIT' ? <ArrowRight size={22} /> : <ArrowLeft size={22} />}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a', fontWeight: 700 }}>
                    {confirmModal.type === 'EXIT' ? 'Confirm Student Exit' : 'Confirm Student Enter (Return)'}
                  </h3>
                  <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                    Reconfirm action before logging to gate register
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setConfirmModal(null)}
                disabled={loading}
                title="Close dialog"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body with Student and Pass Verification Details */}
            <div style={{ padding: '0.25rem 0 1.25rem' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '1.1rem',
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>
                      Student Name
                    </span>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1e293b', marginTop: 2 }}>
                      {confirmModal.pass.student_name}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>
                      Roll Number
                    </span>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#334155', fontSize: '1.05rem', marginTop: 2 }}>
                      {confirmModal.pass.student_id}
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 10, marginTop: 10, fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: '#64748b' }}>Pass ID:</span>
                    <strong style={{ fontFamily: 'monospace', color: '#1e293b' }}>
                      {confirmModal.pass.pass_code || confirmModal.pass.gate_pass_id}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ color: '#64748b' }}>Movement:</span>
                    <span
                      className="badge"
                      style={{
                        background: confirmModal.type === 'EXIT' ? '#dbeafe' : '#d1fae5',
                        color: confirmModal.type === 'EXIT' ? '#1d4ed8' : '#065f46',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: '0.78rem',
                      }}
                    >
                      {confirmModal.type === 'EXIT' ? '🔴 CAMPUS EXIT' : '🟢 CAMPUS ENTRY / RETURN'}
                    </span>
                  </div>
                  {confirmModal.pass.reason && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: '#64748b' }}>Reason:</span>
                      <span style={{ color: '#334155', maxWidth: 260, textAlign: 'right', fontWeight: 500 }}>
                        {confirmModal.pass.reason}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Scheduled Return:</span>
                    <strong style={{ color: '#2563eb' }}>{formatDateTime(confirmModal.pass.return_at)}</strong>
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: confirmModal.type === 'EXIT' ? '#eff6ff' : '#f0fdf4',
                  border: confirmModal.type === 'EXIT' ? '1px solid #bfdbfe' : '1px solid #bbf7d0',
                  borderRadius: 10,
                  padding: '10px 14px',
                  color: confirmModal.type === 'EXIT' ? '#1e40af' : '#166534',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                <span>
                  Please double-check the student's ID and gate pass before confirming this <strong>{confirmModal.type === 'EXIT' ? 'EXIT' : 'ENTRY'}</strong>.
                </span>
              </div>
            </div>

            {/* Modal Actions with Cancel (X) and Confirm Buttons */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmModal(null)}
                disabled={loading}
                style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '0.75rem' }}
              >
                <X size={16} /> Cancel
              </button>
              <button
                type="button"
                className={`btn ${confirmModal.type === 'EXIT' ? 'btn-primary' : 'btn-success'}`}
                onClick={async () => {
                  if (confirmModal.type === 'EXIT') {
                    await handleRecordExit();
                  } else {
                    await handleRecordReturn();
                  }
                }}
                disabled={loading}
                style={{
                  flex: 1.3,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0.75rem',
                  fontWeight: 600,
                  ...(confirmModal.type !== 'EXIT' ? { background: '#059669', borderColor: '#059669', color: '#ffffff' } : {}),
                }}
              >
                <Check size={18} />
                {loading
                  ? 'Recording...'
                  : confirmModal.type === 'EXIT'
                  ? 'Confirm Exit'
                  : 'Confirm Enter / Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav />
    </div>
  );
}
