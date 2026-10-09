"""SMS delivery service via Fast2SMS with virtual/log fallback.

Fast2SMS docs: https://docs.fast2sms.com
API endpoint  : https://www.fast2sms.com/dev/bulkV2

Delivery return values:
  "sent"    -- message was actually dispatched via Fast2SMS
  "virtual" -- no API key configured; message logged but not sent
  "failed"  -- API key present but request failed (logged, does not raise)
"""
import logging
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

_F2S_URL = "https://www.fast2sms.com/dev/bulkV2"


def _ist_str(dt) -> str:
    """Return a human-readable IST string from a naive UTC datetime."""
    if not dt:
        return "N/A"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    from datetime import timedelta
    ist = dt.astimezone(timezone(timedelta(hours=5, minutes=30)))
    return ist.strftime("%d %b %Y, %I:%M %p IST")


def _send_via_fast2sms(api_key: str, sender_id: str, phone: str, message: str) -> bool:
    """Send an SMS via Fast2SMS BulkV2 API. Returns True on success."""
    # Normalize phone: Fast2SMS expects 10-digit Indian numbers without country code
    phone_clean = phone.strip().lstrip("+")
    if phone_clean.startswith("91") and len(phone_clean) == 12:
        phone_clean = phone_clean[2:]
    if len(phone_clean) != 10 or not phone_clean.isdigit():
        logger.warning("SMS skipped: phone '%s' is not a valid 10-digit Indian number", phone)
        return False

    params = {
        "authorization": api_key,
        "sender_id": sender_id,
        "message": message,
        "language": "english",
        "route": "dlt",
        "numbers": phone_clean,
    }
    try:
        resp = httpx.get(_F2S_URL, params=params, timeout=8)
        data = resp.json()
        if data.get("return") is True:
            logger.info("SMS sent via Fast2SMS to %s (request_id: %s)", phone_clean, data.get("request_id"))
            return True
        else:
            logger.warning("Fast2SMS rejected message to %s: %s", phone_clean, data)
            return False
    except Exception as exc:
        logger.warning("Fast2SMS request failed for %s: %s", phone_clean, exc)
        return False


def send_exit_sms(
    *,
    guardian_name: str,
    guardian_phone: str,
    student_name: str,
    gate_pass_id: str,
    exit_at,
    return_at,
    reason: str,
    settings,
) -> str:
    """Send an exit notification SMS to the student's parent.

    Returns "sent", "virtual", or "failed".
    """
    message = (
        f"Dear {guardian_name}, your ward {student_name} has exited campus "
        f"(Pass: {gate_pass_id}) at {_ist_str(exit_at)}. "
        f"Expected return: {_ist_str(return_at)}. "
        f"Reason: {reason}. - JNN Institute"
    )

    logger.info("[SMS-EXIT] To: %s | %s", guardian_phone, message)

    if not settings.fast2sms_api_key:
        logger.info("Fast2SMS API key not configured -- running in virtual SMS mode.")
        return "virtual"

    ok = _send_via_fast2sms(settings.fast2sms_api_key, settings.fast2sms_sender_id, guardian_phone, message)
    return "sent" if ok else "failed"


def send_return_sms(
    *,
    guardian_name: str,
    guardian_phone: str,
    student_name: str,
    gate_pass_id: str,
    returned_at,
    is_overdue: bool,
    settings,
) -> str:
    """Send a return/entry notification SMS to the student's parent.

    Returns "sent", "virtual", or "failed".
    """
    overdue_note = " (OVERDUE -- returned late)" if is_overdue else ""
    message = (
        f"Dear {guardian_name}, your ward {student_name} has safely returned to campus "
        f"at {_ist_str(returned_at)}{overdue_note} "
        f"(Pass: {gate_pass_id}). - JNN Institute"
    )

    logger.info("[SMS-RETURN] To: %s | %s", guardian_phone, message)

    if not settings.fast2sms_api_key:
        logger.info("Fast2SMS API key not configured -- running in virtual SMS mode.")
        return "virtual"

    ok = _send_via_fast2sms(settings.fast2sms_api_key, settings.fast2sms_sender_id, guardian_phone, message)
    return "sent" if ok else "failed"
