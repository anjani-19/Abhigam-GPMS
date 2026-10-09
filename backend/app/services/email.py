"""Email delivery service with rich formatting, virtual mailbox storage, and robust SMTP handling."""
import logging
import smtplib
import ssl
from email.message import EmailMessage
from ..database import SessionLocal
from ..models import SentEmail

logger = logging.getLogger(__name__)


def send_otp_email(*, recipient: str, code: str, purpose: str, settings, verification_url: str | None = None) -> str:
    sender_address = settings.smtp_from_email or "no-reply@jnn.edu.in"
    subject = f"Your JNN INSTITUTE Verification Code: {code}"

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender_address
    message["To"] = recipient

    is_pw_reset = "password" in purpose.lower()
    plain_body = (
        f"JNN INSTITUTE - GATE PASS SYSTEM\n\n"
        f"Your {purpose} verification code is: {code}\n\n"
        f"This code will expire in {settings.otp_expire_minutes} minutes. "
        f"For security reasons, do not share this code with anyone.\n"
    )
    if verification_url:
        plain_body += f"\nOr {'reset your password' if is_pw_reset else 'verify your email'} directly by opening this link:\n{verification_url}\n"

    message.set_content(plain_body)

    action_label = "Reset Password Directly" if is_pw_reset else "Verify Email Directly"
    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }}
    .container {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
    .header {{ background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #ffffff; padding: 24px; text-align: center; }}
    .header h1 {{ margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }}
    .header p {{ margin: 6px 0 0; font-size: 13px; opacity: 0.9; }}
    .content {{ padding: 32px 24px; text-align: center; }}
    .purpose-text {{ font-size: 15px; color: #475569; margin-bottom: 24px; }}
    .otp-code-box {{ background: #eff6ff; border: 2px dashed #93c5fd; border-radius: 10px; padding: 18px 24px; display: inline-block; margin: 0 auto 24px; }}
    .otp-code {{ font-family: monospace, Courier, sans-serif; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1d4ed8; }}
    .expiry-note {{ font-size: 13px; color: #64748b; line-height: 1.5; }}
    .btn-link {{ display: inline-block; margin-top: 20px; background: #2563eb; color: #ffffff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; }}
    .footer {{ background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>JNN INSTITUTE</h1>
      <p>Anumathi — Your Gate, Intelligently Managed</p>
    </div>
    <div class="content">
      <p class="purpose-text">Use the following verification code to complete your <strong>{purpose}</strong>:</p>
      <div class="otp-code-box">
        <span class="otp-code">{code}</span>
      </div>
      <p class="expiry-note">
        This code is valid for <strong>{settings.otp_expire_minutes} minutes</strong>.<br>
        If you did not request this verification, please disregard this email.
      </p>
      {f'<p><a href="{verification_url}" class="btn-link">{action_label}</a></p>' if verification_url else ''}
    </div>
    <div class="footer">
      J.N.N. Institute of Engineering &bull; Automated Security Notification &bull; Do not reply
    </div>
  </div>
</body>
</html>"""

    message.add_alternative(html_body, subtype="html")

    # Record email in database for Virtual Webmail
    delivery_status = "virtual"
    try:
        with SessionLocal() as db:
            sent_record = SentEmail(
                recipient=recipient.lower(),
                sender=sender_address,
                subject=subject,
                body_html=html_body,
                body_plain=plain_body,
                otp_code=code,
                delivery_status="virtual",
            )
            db.add(sent_record)
            db.commit()
            email_id = sent_record.id
    except Exception as db_err:
        logger.warning("Could not persist sent email record: %s", db_err)
        email_id = None

    # If real SMTP is configured, attempt real delivery
    if settings.smtp_host and settings.smtp_from_email:
        try:
            if settings.smtp_port == 465:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context, timeout=3) as server:
                    if settings.smtp_username and settings.smtp_password:
                        server.login(settings.smtp_username, settings.smtp_password)
                    server.send_message(message)
            else:
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=3) as server:
                    if settings.smtp_use_tls:
                        context = ssl.create_default_context()
                        server.starttls(context=context)
                    if settings.smtp_username and settings.smtp_password:
                        server.login(settings.smtp_username, settings.smtp_password)
                    server.send_message(message)
            delivery_status = "sent"
            logger.info("Real SMTP verification email delivered to %s", recipient)
            if email_id:
                with SessionLocal() as db:
                    rec = db.get(SentEmail, email_id)
                    if rec:
                        rec.delivery_status = "sent"
                        db.commit()
            return "sent"
        except Exception as exc:
            logger.warning("SMTP delivery failed for %s (%s). Falling back to Virtual Webmail.", recipient, exc)
            return "virtual"

    logger.info("Virtual Webmail delivered verification code %s for %s", code, recipient)
    return "virtual"

