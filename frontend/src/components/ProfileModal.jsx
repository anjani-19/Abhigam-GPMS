import React, { useState, useEffect } from 'react';
import api from '../api';
import {
  X, CheckCircle2, AlertCircle, Save, Edit3,
  User, Phone, BookOpen, GraduationCap, Home,
  Users, Award, Hash, Building2, ArrowLeft, Send, KeyRound, ShieldCheck
} from 'lucide-react';

/* ─── tiny helper ─── */
function InfoRow({ icon: Icon, label, value, badge }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '0.6rem 0', borderBottom: '1px solid #f1f5f9',
    }}>
      <span style={{
        width: 32, height: 32, borderRadius: 8,
        background: 'var(--primary-light)', color: 'var(--primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={15} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1, flexWrap: 'wrap' }}>
          <p style={{ fontSize: '0.93rem', color: '#1e293b', fontWeight: 600, margin: 0 }}>
            {value || <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>Not set</span>}
          </p>
          {badge}
        </div>
      </div>
    </div>
  );
}

/* ─── completion ring ─── */
function CompletionRing({ pct }) {
  const r = 32, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct === 100 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={80} height={80} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={40} cy={40} r={r} fill="none" stroke="#e2e8f0" strokeWidth={7} />
      <circle
        cx={40} cy={40} r={r} fill="none"
        stroke={color} strokeWidth={7}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x={40} y={44} textAnchor="middle"
        style={{ transform: 'rotate(90deg)', transformOrigin: '40px 40px', fill: color, fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>
        {pct}%
      </text>
    </svg>
  );
}

export default function ProfileModal({ onClose, onProfileUpdated }) {
  const [mode, setMode] = useState('view'); // 'view' | 'edit'
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [structure, setStructure] = useState({
    departments: [], academic_years: [], semesters: [], sections: [],
    hostels: [], hostel_blocks: [],
  });

  const [formData, setFormData] = useState({
    phone: '',
    gender: '',
    department_id: '',
    year_id: '',
    semester_id: '',
    section_id: '',
    cgpa: '',
    arrears: 0,
    guardian_name: '',
    guardian_relationship: 'Father',
    guardian_phone: '',
    accommodation: 'DAY_SCHOLAR',
    hostel_block_id: '',
    room_number: '',
  });

  // Student Phone OTP state
  const [studentPhoneVerified, setStudentPhoneVerified] = useState(false);
  const [studentOtpSent, setStudentOtpSent] = useState(false);
  const [studentOtp, setStudentOtp] = useState('');
  const [studentOtpLoading, setStudentOtpLoading] = useState(false);
  const [studentOtpMsg, setStudentOtpMsg] = useState('');
  const [studentOtpErr, setStudentOtpErr] = useState('');
  const [studentCountdown, setStudentCountdown] = useState(0);

  // Guardian Phone OTP state
  const [guardianPhoneVerified, setGuardianPhoneVerified] = useState(false);
  const [guardianOtpSent, setGuardianOtpSent] = useState(false);
  const [guardianOtp, setGuardianOtp] = useState('');
  const [guardianOtpLoading, setGuardianOtpLoading] = useState(false);
  const [guardianOtpMsg, setGuardianOtpMsg] = useState('');
  const [guardianOtpErr, setGuardianOtpErr] = useState('');
  const [guardianCountdown, setGuardianCountdown] = useState(0);

  // Countdown timer effect
  useEffect(() => {
    let t;
    if (studentCountdown > 0) {
      t = setTimeout(() => setStudentCountdown((c) => c - 1), 1000);
    }
    return () => clearTimeout(t);
  }, [studentCountdown]);

  useEffect(() => {
    let t;
    if (guardianCountdown > 0) {
      t = setTimeout(() => setGuardianCountdown((c) => c - 1), 1000);
    }
    return () => clearTimeout(t);
  }, [guardianCountdown]);

  const loadData = async () => {
    try {
      const [structRes, profRes, meRes] = await Promise.all([
        api.get('/meta/academic-structure'),
        api.get('/student/profile'),
        api.get('/me'),
      ]);
      setStructure(structRes.data);
      const p = profRes.data.profile;
      setProfileData({
        ...profRes.data,
        profile: p,
        name: meRes.data.name,
        student_id: meRes.data.student_id,
      });
      setFormData({
        phone: p.phone || '',
        gender: p.gender || '',
        department_id: p.department_id || '',
        year_id: p.year_id || '',
        semester_id: p.semester_id || '',
        section_id: p.section_id || '',
        cgpa: p.cgpa || '',
        arrears: p.arrears ?? 0,
        guardian_name: p.guardian_name || '',
        guardian_relationship: p.guardian_relationship || 'Father',
        guardian_phone: p.guardian_phone || '',
        accommodation: p.accommodation || 'DAY_SCHOLAR',
        hostel_block_id: p.hostel_block_id || '',
        room_number: p.room_number || '',
      });
      setStudentPhoneVerified(Boolean(p.phone));
      setGuardianPhoneVerified(Boolean(p.guardian_phone));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load profile details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSendOtp = async (purpose) => {
    const isStudent = purpose === 'student_phone';
    const phone = (isStudent ? formData.phone : formData.guardian_phone) || '';

    if (phone.trim().length < 10) {
      if (isStudent) setStudentOtpErr('Please enter a valid 10-digit mobile number.');
      else setGuardianOtpErr('Please enter a valid 10-digit mobile number.');
      return;
    }

    if (isStudent) {
      setStudentOtpLoading(true);
      setStudentOtpErr('');
      setStudentOtpMsg('');
    } else {
      setGuardianOtpLoading(true);
      setGuardianOtpErr('');
      setGuardianOtpMsg('');
    }

    try {
      const res = await api.post('/phone-verify/send', {
        phone: phone.trim(),
        purpose,
      });
      const note = res.data.development_otp
        ? `${res.data.message} (Test OTP: ${res.data.development_otp})`
        : res.data.message;

      if (isStudent) {
        setStudentOtpSent(true);
        setStudentCountdown(30);
        setStudentOtpMsg(note);
      } else {
        setGuardianOtpSent(true);
        setGuardianCountdown(30);
        setGuardianOtpMsg(note);
      }
    } catch (err) {
      const errMsg = err.response?.data?.detail || 'Failed to send verification code.';
      if (isStudent) setStudentOtpErr(errMsg);
      else setGuardianOtpErr(errMsg);
    } finally {
      if (isStudent) setStudentOtpLoading(false);
      else setGuardianOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (purpose) => {
    const isStudent = purpose === 'student_phone';
    const phone = (isStudent ? formData.phone : formData.guardian_phone) || '';
    const code = isStudent ? studentOtp : guardianOtp;

    if (!code || code.trim().length !== 6) {
      if (isStudent) setStudentOtpErr('Please enter the 6-digit OTP code.');
      else setGuardianOtpErr('Please enter the 6-digit OTP code.');
      return;
    }

    if (isStudent) {
      setStudentOtpLoading(true);
      setStudentOtpErr('');
    } else {
      setGuardianOtpLoading(true);
      setGuardianOtpErr('');
    }

    try {
      await api.post('/phone-verify/verify', {
        phone: phone.trim(),
        code: code.trim(),
        purpose,
      });
      if (isStudent) {
        setStudentPhoneVerified(true);
        setStudentOtpSent(false);
        setStudentOtp('');
        setStudentOtpMsg('Student phone number verified successfully!');
      } else {
        setGuardianPhoneVerified(true);
        setGuardianOtpSent(false);
        setGuardianOtp('');
        setGuardianOtpMsg('Parent phone number verified successfully!');
      }
    } catch (err) {
      const errMsg = err.response?.data?.detail || 'Invalid or expired OTP. Please try again.';
      if (isStudent) setStudentOtpErr(errMsg);
      else setGuardianOtpErr(errMsg);
    } finally {
      if (isStudent) setStudentOtpLoading(false);
      else setGuardianOtpLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const parsed = name === 'arrears' || name.endsWith('_id') ? (value ? parseInt(value) : '') : value;

    if (name === 'phone') {
      const orig = profileData?.profile?.phone || '';
      const isMatch = Boolean(value && value === orig);
      setStudentPhoneVerified(isMatch);
      if (!isMatch) {
        setStudentOtpSent(false);
        setStudentOtp('');
        setStudentOtpMsg('');
        setStudentOtpErr('');
      }
    }

    if (name === 'guardian_phone') {
      const orig = profileData?.profile?.guardian_phone || '';
      const isMatch = Boolean(value && value === orig);
      setGuardianPhoneVerified(isMatch);
      if (!isMatch) {
        setGuardianOtpSent(false);
        setGuardianOtp('');
        setGuardianOtpMsg('');
        setGuardianOtpErr('');
      }
    }

    setFormData((prev) => {
      const next = { ...prev, [name]: parsed };
      // When gender changes, clear block selection (blocks are gender-filtered)
      if (name === 'gender') {
        next.hostel_block_id = '';
      }
      if (name === 'department_id') {
        const matchingYears = structure.academic_years.filter((y) => y.department_id === parsed);
        const validYear = matchingYears.some((y) => y.id === prev.year_id);
        if (!validYear) {
          next.year_id = matchingYears[0]?.id || '';
          const matchingSems = structure.semesters.filter((s) => s.year_id === next.year_id);
          next.semester_id = matchingSems[0]?.id || '';
          const matchingSecs = structure.sections.filter((sec) => sec.semester_id === next.semester_id);
          next.section_id = matchingSecs[0]?.id || '';
        }
      } else if (name === 'year_id') {
        const matchingSems = structure.semesters.filter((s) => s.year_id === parsed);
        const validSem = matchingSems.some((s) => s.id === prev.semester_id);
        if (!validSem) {
          next.semester_id = matchingSems[0]?.id || '';
          const matchingSecs = structure.sections.filter((sec) => sec.semester_id === next.semester_id);
          next.section_id = matchingSecs[0]?.id || '';
        }
      } else if (name === 'semester_id') {
        const matchingSecs = structure.sections.filter((sec) => sec.semester_id === parsed);
        const validSec = matchingSecs.some((sec) => sec.id === prev.section_id);
        if (!validSec) {
          next.section_id = matchingSecs[0]?.id || '';
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const payload = {
        ...formData,
        arrears: parseInt(formData.arrears) || 0,
        department_id: formData.department_id ? parseInt(formData.department_id) : null,
        year_id: formData.year_id ? parseInt(formData.year_id) : null,
        semester_id: formData.semester_id ? parseInt(formData.semester_id) : null,
        section_id: formData.section_id ? parseInt(formData.section_id) : null,
        hostel_block_id: formData.accommodation === 'HOSTELLER' && formData.hostel_block_id ? parseInt(formData.hostel_block_id) : null,
        room_number: formData.accommodation === 'HOSTELLER' ? formData.room_number : null,
      };
      const res = await api.put('/student/profile', payload);
      setMessage(`Profile saved! Completion: ${res.data.completion}%`);
      if (onProfileUpdated) onProfileUpdated(res.data.completion);
      await loadData();
      setTimeout(() => { setMode('view'); setMessage(''); }, 900);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  /* ── derived display values ── */
  const p = profileData?.profile || {};
  const completion = profileData?.completion ?? 0;
  const deptName  = structure.departments.find((d) => d.id === p.department_id)?.name;
  const yearName  = structure.academic_years.find((y) => y.id === p.year_id)?.name;
  const semName   = structure.semesters.find((s) => s.id === p.semester_id)?.name;
  const secName   = structure.sections.find((s) => s.id === p.section_id)?.name;
  const blockName = structure.hostel_blocks.find((b) => b.id === p.hostel_block_id)?.name;

  const availableYears = structure.academic_years.filter(
    (y) => !formData.department_id || y.department_id === parseInt(formData.department_id)
  );
  const yearsToShow = availableYears.length > 0 ? availableYears : structure.academic_years;

  const availableSemesters = structure.semesters.filter(
    (s) => !formData.year_id || s.year_id === parseInt(formData.year_id)
  );
  const semestersToShow = availableSemesters.length > 0 ? availableSemesters : structure.semesters;

  const availableSections = structure.sections.filter(
    (sec) => !formData.semester_id || sec.semester_id === parseInt(formData.semester_id)
  );
  const sectionsToShow = availableSections.length > 0 ? availableSections : structure.sections;

  // Filter hostel blocks by selected gender
  const blocksForGender = formData.gender
    ? structure.hostel_blocks.filter((b) => b.gender === formData.gender)
    : structure.hostel_blocks;

  const canSubmit = !saving;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640, padding: 0, overflow: 'hidden' }}
      >
        {/* ── Header banner ── */}
        <div style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          padding: '1.4rem 1.6rem 1.2rem',
          position: 'relative',
        }}>
          {/* back arrow when in edit mode */}
          {mode === 'edit' && (
            <button
              onClick={() => { setMode('view'); setError(''); setMessage(''); }}
              style={{
                position: 'absolute', top: 14, left: 14,
                background: 'rgba(255,255,255,0.15)', border: 'none',
                borderRadius: 8, color: '#fff', width: 34, height: 34,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
              title="Back to profile"
            >
              <ArrowLeft size={17} />
            </button>
          )}

          <button
            className="btn-close"
            onClick={onClose}
            style={{ position: 'absolute', top: 14, right: 14, color: '#fff', background: 'rgba(255,255,255,0.15)', border: 'none' }}
          >
            <X size={20} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: mode === 'edit' ? 8 : 0 }}>
            {/* Avatar circle */}
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 700, color: '#fff', flexShrink: 0,
              border: '2px solid rgba(255,255,255,0.35)',
            }}>
              {profileData?.name?.charAt(0)?.toUpperCase() || <User size={22} />}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {mode === 'view' ? 'Student Profile' : 'Edit Profile'}
              </p>
              <h3 style={{ color: '#fff', fontSize: '1.15rem', fontWeight: 700, margin: '2px 0' }}>
                {profileData?.name || 'Loading...'}
              </h3>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem' }}>
                {profileData?.student_id}
              </p>
            </div>

            {/* Completion ring */}
            {!loading && (
              <div style={{ flexShrink: 0, textAlign: 'center' }}>
                <CompletionRing pct={completion} />
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.68rem', marginTop: 2 }}>Complete</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '1.25rem 1.6rem 1.5rem', maxHeight: '72vh', overflowY: 'auto' }}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
              <AlertCircle size={16} /><span>{error}</span>
            </div>
          )}
          {message && (
            <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
              <CheckCircle2 size={16} /><span>{message}</span>
            </div>
          )}

          {loading ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading profile…</p>
          ) : mode === 'view' ? (
            /* ════════ VIEW MODE ════════ */
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1.5rem' }}>
                <InfoRow
                  icon={Phone}
                  label="Student Phone"
                  value={p.phone}
                  badge={p.phone ? (
                    <span style={{
                      background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0',
                      fontSize: '0.68rem', padding: '1px 6px', borderRadius: 999,
                      fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3
                    }}>
                      <CheckCircle2 size={11} /> Verified
                    </span>
                  ) : null}
                />
                <InfoRow icon={User}        label="Gender"         value={p.gender === 'MALE' ? 'Male' : p.gender === 'FEMALE' ? 'Female' : undefined} />
                <InfoRow icon={BookOpen}    label="Department"     value={deptName} />
                <InfoRow icon={GraduationCap} label="Academic Year" value={yearName} />
                <InfoRow icon={Hash}        label="Semester"       value={semName} />
                <InfoRow icon={Users}       label="Section"        value={secName} />
                <InfoRow icon={Award}       label="CGPA"           value={p.cgpa} />
                <InfoRow icon={AlertCircle} label="Active Arrears" value={p.arrears != null ? String(p.arrears) : undefined} />
                <InfoRow icon={Home}        label="Accommodation"  value={p.accommodation === 'HOSTELLER' ? 'Hosteller' : p.accommodation ? 'Day Scholar' : undefined} />
                {p.accommodation === 'HOSTELLER' && (
                  <>
                    <InfoRow icon={Building2} label="Hostel Block" value={blockName} />
                    <InfoRow icon={Hash}      label="Room Number"  value={p.room_number} />
                  </>
                )}
              </div>

              {/* Guardian section */}
              <div style={{ marginTop: '1rem', background: '#f8fafc', borderRadius: 12, padding: '0.9rem 1rem' }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Parent Details
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1.5rem' }}>
                  <InfoRow icon={User}  label="Parent Name"    value={p.guardian_name} />
                  <InfoRow icon={Users} label="Relationship"   value={p.guardian_relationship} />
                  <div style={{ gridColumn: '1 / -1' }}>
                    <InfoRow
                      icon={Phone}
                      label="Parent Phone"
                      value={p.guardian_phone}
                      badge={p.guardian_phone ? (
                        <span style={{
                          background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0',
                          fontSize: '0.68rem', padding: '1px 6px', borderRadius: 999,
                          fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3
                        }}>
                          <CheckCircle2 size={11} /> Verified
                        </span>
                      ) : null}
                    />
                  </div>
                </div>
              </div>

              {/* Bottom action buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: '1.4rem' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setMode('edit')}
                >
                  <Edit3 size={15} /> Edit Profile
                </button>
              </div>
            </>
          ) : (
            /* ════════ EDIT MODE ════════ */
            <form onSubmit={handleSubmit}>
              {/* ── Student Phone with OTP Verification ── */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '1rem',
                marginBottom: '1.25rem',
              }}>
                <label style={{ margin: 0, fontWeight: 700, fontSize: '0.88rem', color: '#1e293b', marginBottom: 6, display: 'block' }}>
                  Student Mobile Number
                </label>
                <input
                  name="phone"
                  type="tel"
                  className="form-control"
                  placeholder="10-digit mobile number"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* ── Academic & Personal Details Grid ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Gender</label>
                  <select name="gender" className="form-control" value={formData.gender} onChange={handleChange} required>
                    <option value="">Select Gender</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Department</label>
                  <select name="department_id" className="form-control" value={formData.department_id} onChange={handleChange} required>
                    <option value="">Select Department</option>
                    {structure.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Academic Year</label>
                  <select name="year_id" className="form-control" value={formData.year_id} onChange={handleChange} required>
                    <option value="">Select Year</option>
                    {yearsToShow.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Semester</label>
                  <select name="semester_id" className="form-control" value={formData.semester_id} onChange={handleChange} required>
                    <option value="">Select Semester</option>
                    {semestersToShow.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Section</label>
                  <select name="section_id" className="form-control" value={formData.section_id} onChange={handleChange} required>
                    <option value="">Select Section</option>
                    {sectionsToShow.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>CGPA</label>
                  <input name="cgpa" className="form-control" placeholder="e.g. 8.75"
                    value={formData.cgpa} onChange={handleChange} required />
                </div>

                <div className="form-group">
                  <label>Active Arrears</label>
                  <input type="number" name="arrears" min="0" className="form-control"
                    value={formData.arrears} onChange={handleChange} required />
                </div>

                <div className="form-group">
                  <label>Accommodation</label>
                  <select name="accommodation" className="form-control" value={formData.accommodation} onChange={handleChange} required>
                    <option value="DAY_SCHOLAR">Day Scholar</option>
                    <option value="HOSTELLER">Hosteller</option>
                  </select>
                </div>
              </div>

              {formData.accommodation === 'HOSTELLER' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem', background: '#f8fafc', padding: '1rem', borderRadius: 12 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Hostel Block</label>
                    {!formData.gender && (
                      <p style={{ fontSize: '0.78rem', color: '#f59e0b', marginBottom: 4 }}>⚠ Select gender first to see available blocks</p>
                    )}
                    <select name="hostel_block_id" className="form-control" value={formData.hostel_block_id} onChange={handleChange} required disabled={!formData.gender}>
                      <option value="">Select Block</option>
                      {blocksForGender.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Room Number</label>
                    <input name="room_number" className="form-control" placeholder="e.g. 204"
                      value={formData.room_number} onChange={handleChange} required />
                  </div>
                </div>
              )}

              {/* ── Guardian Section with OTP Verification ── */}
              <div style={{ marginTop: '1.25rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.25rem' }}>
                <h4 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', color: '#1e293b' }}>Parent Contact Details</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Parent Name</label>
                    <input name="guardian_name" className="form-control" placeholder="Parent / Guardian"
                      value={formData.guardian_name} onChange={handleChange} required />
                  </div>
                  <div className="form-group">
                    <label>Relationship</label>
                    <input name="guardian_relationship" className="form-control" placeholder="Father / Mother / Guardian"
                      value={formData.guardian_relationship} onChange={handleChange} required />
                  </div>
                </div>

                {/* Parent Phone */}
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ margin: 0, fontWeight: 700, fontSize: '0.88rem', color: '#1e293b', marginBottom: 6, display: 'block' }}>
                    Parent Mobile Number
                  </label>
                  <input
                    name="guardian_phone"
                    type="tel"
                    className="form-control"
                    placeholder="Active parent contact number"
                    value={formData.guardian_phone}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setMode('view'); setError(''); }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving || !canSubmit}
                  style={{ opacity: canSubmit ? 1 : 0.6 }}
                >
                  <Save size={16} />
                  {saving ? 'Saving…' : 'Save Profile'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
