/**
 * Date and Time utilities for Anumathi Gate Pass System.
 * Ensures accurate local time formatting, countdowns, and activation/expiry state tracking.
 */

export function parseDate(dateStr) {
  if (!dateStr) return null;
  // If the date string does not have a timezone offset or Z, treat it as UTC to avoid local timezone offset drift
  const s = String(dateStr).trim();
  if (!s.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(s) && s.includes('T')) {
    return new Date(`${s}Z`);
  }
  return new Date(s);
}

export function formatDateTime(dateStr, options = {}) {
  const d = parseDate(dateStr);
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options,
  });
}

export function formatDateOnly(dateStr) {
  const d = parseDate(dateStr);
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTimeOnly(dateStr) {
  const d = parseDate(dateStr);
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDuration(seconds) {
  if (seconds <= 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
  }
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

export function formatCountdownClock(seconds) {
  if (seconds <= 0) return '00:00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function getPassTiming(pass, now = new Date()) {
  if (!pass) return null;
  const exitDate = parseDate(pass.exit_at);
  const returnDate = parseDate(pass.return_at);

  // Activation begins 10 minutes before scheduled departure time
  let activationDate = parseDate(pass.qr_activates_at);
  if (!activationDate && exitDate && !isNaN(exitDate.getTime())) {
    activationDate = new Date(exitDate.getTime() - 10 * 60 * 1000);
  }
  
  // Expiry is 30 minutes after expected return
  let expiryDate = parseDate(pass.qr_expires_at);
  if (!expiryDate && returnDate && !isNaN(returnDate.getTime())) {
    expiryDate = new Date(returnDate.getTime() + 30 * 60 * 1000);
  }

  const nowMs = now.getTime();
  const activationMs = activationDate ? activationDate.getTime() : 0;
  const expiryMs = expiryDate ? expiryDate.getTime() : Infinity;

  const isEarly = Boolean(activationDate && nowMs < activationMs);
  const isExpired = Boolean(expiryDate && nowMs > expiryMs);
  const isActive = Boolean(!isEarly && !isExpired);

  const secondsUntilActivation = isEarly ? Math.max(0, Math.floor((activationMs - nowMs) / 1000)) : 0;
  const secondsUntilExpiry = (!isExpired && expiryDate) ? Math.max(0, Math.floor((expiryMs - nowMs) / 1000)) : 0;

  return {
    exitDate,
    activationDate,
    returnDate,
    expiryDate,
    isEarly,
    isActive,
    isExpired,
    secondsUntilActivation,
    secondsUntilExpiry,
  };
}

export function toLocalDatetimeInputString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${y}-${m}-${d}T${h}:${min}`;
}
