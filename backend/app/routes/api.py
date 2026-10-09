from datetime import datetime, timedelta, timezone
import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import current_user, hash_password, hash_token, jwt_for, require, token, verify_password
from ..config import get_settings
from ..database import get_db
from ..models import (
    AcademicYear,
    Approval,
    College,
    CollegeRequest,
    CollegeRequestStatus,
    Department,
    EmailDomain,
    ExitLog,
    ExtensionLog,
    ExtensionRequest,
    GatePass,
    Hostel,
    HostelBlock,
    OTP,
    PassStatus,
    Role,
    Section,
    Semester,
    StaffProfile,
    StaffStatus,
    StudentProfile,
    User,
    SentEmail,
)
from ..schemas import (
    CollegeInquiry,
    CollegeRequestDecision,
    Decision,
    EmailOnly,
    ExtensionDecision,
    Login,
    OTPVerify,
    PassCreate,
    PassExtend,
    PhoneOTPSend,
    PhoneOTPVerify,
    ProfileUpdate,
    Register,
    ResendOTPRequest,
    Scan,
    StaffProfileUpdate,
    TokenVerify,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    ResetPasswordWithTokenRequest,
)
from ..services.email import send_emergency_alert_email, send_otp_email
from ..services.sms import send_exit_sms, send_return_sms

router = APIRouter()


def utc_now() -> datetime:
    """Return naive UTC datetime (matching SQLite naive storage)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_iso_utc(dt: datetime | None) -> str | None:
    """Format any datetime to an unambiguous UTC ISO 8601 string ending with Z."""
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def domain_ok(db: Session, email: str, college_id: int) -> bool:
    domain = email.rsplit("@", 1)[-1].strip().lower()
    settings_domains = get_settings().domains
    if settings_domains and ("*" in settings_domains or "all" in settings_domains):
        return True
    configured = db.scalars(
        select(EmailDomain.domain).where(
            EmailDomain.college_id == college_id,
            EmailDomain.is_active == True,
        )
    ).all()
    allowed = set(configured) | (settings_domains or set())
    return domain in allowed


def create_otp(db: Session, email: str, purpose: str) -> str:
    # Invalidate previous unused OTPs for this email and purpose so only the fresh OTP works
    for previous in db.scalars(
        select(OTP).where(OTP.email == email.lower(), OTP.purpose == purpose, OTP.used == False)
    ).all():
        previous.used = True

    raw = f"{secrets.randbelow(1000000):06d}"
    record = OTP(
        email=email.lower(),
        purpose=purpose,
        code_hash=hash_token(raw),
        expires_at=utc_now() + timedelta(minutes=get_settings().otp_expire_minutes),
    )
    db.add(record)
    db.commit()
    return raw


def issue_email_link(db: Session, email: str) -> str:
    for previous in db.scalars(
        select(OTP).where(OTP.email == email.lower(), OTP.purpose == "registration_link", OTP.used == False)
    ).all():
        previous.used = True
    raw = token()
    record = OTP(
        email=email.lower(),
        purpose="registration_link",
        code_hash=hash_token(raw),
        expires_at=utc_now() + timedelta(minutes=get_settings().otp_expire_minutes),
    )
    db.add(record)
    db.commit()
    base = get_settings().api_public_url.rstrip("/")
    return f"{base}/auth/verify-email-link?{urlencode({'token': raw})}"


def send_registration_verification(db: Session, user: User):
    raw = create_otp(db, user.email, "registration")
    link = issue_email_link(db, user.email)
    delivery = send_otp_email(
        recipient=user.email,
        code=raw,
        purpose="email registration",
        verification_url=link,
        settings=get_settings(),
    )
    return raw, delivery


def issue_password_reset_link(db: Session, email: str) -> str:
    for previous in db.scalars(
        select(OTP).where(OTP.email == email.lower(), OTP.purpose == "password_reset_link", OTP.used == False)
    ).all():
        previous.used = True
    raw = token()
    record = OTP(
        email=email.lower(),
        purpose="password_reset_link",
        code_hash=hash_token(raw),
        expires_at=utc_now() + timedelta(minutes=get_settings().otp_expire_minutes),
    )
    db.add(record)
    db.commit()
    frontend_base = get_settings().frontend_url.rstrip("/")
    return f"{frontend_base}/reset-password?{urlencode({'token': raw, 'email': email.lower()})}"


def send_password_reset_notification(db: Session, user: User):
    raw = create_otp(db, user.email, "password_reset")
    link = issue_password_reset_link(db, user.email)
    delivery = send_otp_email(
        recipient=user.email,
        code=raw,
        purpose="Password Reset",
        verification_url=link,
        settings=get_settings(),
    )
    return raw, delivery


def calculate_completion(p: StudentProfile | None) -> int:
    if not p:
        return 0
    fields = [
        bool(p.phone),
        bool(p.gender),
        bool(p.department_id),
        bool(p.year_id),
        bool(p.semester_id),
        bool(p.section_id),
        bool(p.cgpa),
        p.arrears is not None,
        bool(p.guardian_name),
        bool(p.guardian_relationship),
        bool(p.guardian_phone),
        bool(p.accommodation),
    ]
    if p.accommodation == "HOSTELLER":
        fields.extend([bool(p.hostel_block_id), bool(p.room_number)])
    return round(sum(1 for f in fields if f) * 100 / len(fields))


@router.get("/health")
def health():
    return {"status": "ok", "timestamp": to_iso_utc(utc_now())}


@router.get("/meta/academic-structure")
def academic_structure(db: Session = Depends(get_db)):
    departments = db.scalars(select(Department).order_by(Department.id)).all()
    years = db.scalars(select(AcademicYear).order_by(AcademicYear.id)).all()
    semesters = db.scalars(select(Semester).order_by(Semester.id)).all()
    sections = db.scalars(select(Section).order_by(Section.id)).all()
    hostels = db.scalars(select(Hostel).order_by(Hostel.id)).all()
    blocks = db.scalars(select(HostelBlock).order_by(HostelBlock.id)).all()

    return {
        "departments": [{"id": d.id, "name": d.name} for d in departments],
        "academic_years": [{"id": y.id, "name": y.name, "department_id": y.department_id} for y in years],
        "semesters": [{"id": s.id, "name": s.name, "year_id": s.year_id} for s in semesters],
        "sections": [{"id": sec.id, "name": sec.name, "semester_id": sec.semester_id} for sec in sections],
        "hostels": [{"id": h.id, "name": h.name} for h in hostels],
        "hostel_blocks": [{"id": b.id, "name": b.name, "hostel_id": b.hostel_id, "gender": b.gender} for b in blocks],
    }


@router.post("/auth/register")
def register(body: Register, db: Session = Depends(get_db)):
    if not domain_ok(db, str(body.email), body.college_id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Email domain is not an active official college domain")
    if db.scalar(select(User).where(User.email == str(body.email).lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email is already registered")
    if body.student_id and db.scalar(select(StudentProfile).where(StudentProfile.student_id == body.student_id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Student ID is already registered")
    if body.employee_id and db.scalar(select(StaffProfile).where(StaffProfile.employee_id == body.employee_id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Employee ID is already registered")

    user = User(
        college_id=body.college_id,
        email=str(body.email).lower(),
        full_name=body.full_name,
        password_hash=hash_password(body.password),
        role=body.role,
        email_verified=True,
        staff_status=StaffStatus.APPROVED if body.role == Role.STUDENT else StaffStatus.PENDING,
    )
    db.add(user)
    db.flush()

    if body.role == Role.STUDENT:
        db.add(StudentProfile(user_id=user.id, student_id=body.student_id, phone=body.phone))
    else:
        db.add(
            StaffProfile(
                user_id=user.id,
                employee_id=body.employee_id,
                phone=body.phone,
                department_id=body.department_id,
                designation=body.role.value,
            )
        )

    db.commit()
    return {
        "message": "Account created successfully.",
        "access_token": jwt_for(user),
        "token_type": "bearer",
        "role": user.role.value,
        "name": user.full_name,
    }


@router.post("/auth/verify-email")
def verify_email(body: OTPVerify, db: Session = Depends(get_db)):
    rec = db.scalar(
        select(OTP).where(OTP.email == str(body.email).lower(), OTP.purpose == body.purpose).order_by(OTP.id.desc())
    )
    if not rec or rec.used or rec.expires_at < utc_now() or rec.attempts >= get_settings().otp_max_attempts:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "OTP is invalid, expired, or already used")
    rec.attempts += 1
    if rec.code_hash != hash_token(body.code):
        db.commit()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid OTP")
    rec.used = True
    user = db.scalar(select(User).where(User.email == str(body.email).lower()))
    if user:
        user.email_verified = True
    db.commit()
    return {"message": "Email verified successfully"}


@router.get("/auth/verify-email-link")
def verify_email_link(token: str, db: Session = Depends(get_db)):
    rec = db.scalar(
        select(OTP).where(OTP.purpose == "registration_link", OTP.code_hash == hash_token(token)).order_by(OTP.id.desc())
    )
    target = f"{get_settings().frontend_url.rstrip('/')}/verify-email"
    if not rec or rec.used or rec.expires_at < utc_now():
        return RedirectResponse(url=f"{target}?status=invalid")
    user = db.scalar(select(User).where(User.email == rec.email))
    if not user:
        return RedirectResponse(url=f"{target}?status=invalid")
    rec.used = True
    user.email_verified = True
    db.commit()
    return RedirectResponse(url=f"{target}?status=verified")


@router.post("/auth/resend-verification")
def resend_verification(body: EmailOnly, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == str(body.email).lower()))
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    if user.email_verified:
        # If user is already verified and requesting a resend, send a fresh login OTP
        raw = create_otp(db, user.email, "login")
        delivery = send_otp_email(
            recipient=user.email,
            code=raw,
            purpose="login",
            settings=get_settings(),
        )
        return {
            "message": "A fresh login OTP was sent",
            "email_delivery": delivery,
            "development_otp": raw if get_settings().expose_otp_in_local_response else None,
        }
    raw, delivery = send_registration_verification(db, user)
    return {
        "message": "A fresh verification OTP and link were sent",
        "email_delivery": delivery,
        "development_otp": raw if get_settings().expose_otp_in_local_response else None,
    }


@router.post("/auth/resend-otp")
def resend_otp(body: ResendOTPRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == str(body.email).lower()))
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")

    purpose = (body.purpose or ("registration" if not user.email_verified else "login")).lower()

    if purpose == "registration":
        if user.email_verified:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email is already verified. Please sign in.")
        raw, delivery = send_registration_verification(db, user)
        return {
            "message": "A fresh registration verification OTP and link were sent",
            "email_delivery": delivery,
            "development_otp": raw if get_settings().expose_otp_in_local_response else None,
        }
    elif purpose == "password_reset":
        raw, delivery = send_password_reset_notification(db, user)
        return {
            "message": "A fresh password reset code was sent",
            "email_delivery": delivery,
            "development_otp": raw if get_settings().expose_otp_in_local_response else None,
        }
    else:
        if not user.email_verified:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Please verify your email first")
        if user.role not in {Role.STUDENT, Role.ADMIN, Role.PRINCIPAL} and user.staff_status != StaffStatus.APPROVED:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff registration awaits principal approval")

        raw = create_otp(db, user.email, "login")
        delivery = send_otp_email(
            recipient=user.email,
            code=raw,
            purpose="login",
            settings=get_settings(),
        )
        return {
            "message": "A fresh login OTP was sent",
            "email_delivery": delivery,
            "development_otp": raw if get_settings().expose_otp_in_local_response else None,
        }


@router.post("/auth/login")
def login(body: Login, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == str(body.email).lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.email_verified:
        user.email_verified = True
        db.commit()
    if user.role not in {Role.STUDENT, Role.ADMIN, Role.PRINCIPAL} and user.staff_status != StaffStatus.APPROVED:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff registration awaits principal approval")

    return {
        "access_token": jwt_for(user),
        "token_type": "bearer",
        "role": user.role.value,
        "name": user.full_name,
        "message": "Login successful",
    }


@router.post("/auth/verify-login")
def verify_login(body: TokenVerify, db: Session = Depends(get_db)):
    rec = db.scalar(
        select(OTP).where(OTP.email == str(body.email).lower(), OTP.purpose == "login").order_by(OTP.id.desc())
    )
    if not rec or rec.used or rec.expires_at < utc_now() or rec.code_hash != hash_token(body.code):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "OTP is invalid, expired, or already used")
    rec.used = True
    user = db.scalar(select(User).where(User.email == str(body.email).lower()))
    db.commit()
    return {"access_token": jwt_for(user), "token_type": "bearer", "role": user.role.value, "name": user.full_name}


@router.post("/auth/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == str(body.email).lower()))
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No account found with this email address")
    if not user.active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is inactive or disabled")

    raw, delivery = send_password_reset_notification(db, user)
    return {
        "message": "Password reset code dispatched to your email",
        "email_delivery": delivery,
        "development_otp": raw if get_settings().expose_otp_in_local_response else None,
    }


@router.post("/auth/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == str(body.email).lower()))
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")

    rec = db.scalar(
        select(OTP).where(OTP.email == str(body.email).lower(), OTP.purpose == "password_reset").order_by(OTP.id.desc())
    )
    if not rec or rec.used or rec.expires_at < utc_now() or rec.attempts >= get_settings().otp_max_attempts:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Verification code is invalid, expired, or already used")

    rec.attempts += 1
    if rec.code_hash != hash_token(body.code):
        db.commit()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid verification code")

    rec.used = True

    # Invalidate all unused password reset OTPs and links for this user
    for other in db.scalars(
        select(OTP).where(
            OTP.email == user.email,
            OTP.purpose.in_(["password_reset", "password_reset_link"]),
            OTP.used == False,
        )
    ).all():
        other.used = True

    user.password_hash = hash_password(body.new_password)
    user.email_verified = True
    db.commit()
    return {"message": "Password reset successfully. You can now sign in with your new password."}


@router.post("/auth/reset-password-token")
def reset_password_with_token(body: ResetPasswordWithTokenRequest, db: Session = Depends(get_db)):
    rec = db.scalar(
        select(OTP).where(
            OTP.purpose == "password_reset_link",
            OTP.code_hash == hash_token(body.token),
            OTP.email == str(body.email).lower(),
        ).order_by(OTP.id.desc())
    )
    if not rec or rec.used or rec.expires_at < utc_now():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Password reset link is invalid or expired")

    user = db.scalar(select(User).where(User.email == rec.email))
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")

    rec.used = True
    for other in db.scalars(
        select(OTP).where(
            OTP.email == user.email,
            OTP.purpose.in_(["password_reset", "password_reset_link"]),
            OTP.used == False,
        )
    ).all():
        other.used = True

    user.password_hash = hash_password(body.new_password)
    user.email_verified = True
    db.commit()
    return {"message": "Password reset successfully. You can now sign in with your new password."}


@router.get("/auth/validate-reset-token")
def validate_reset_token(token: str, email: str, db: Session = Depends(get_db)):
    rec = db.scalar(
        select(OTP).where(
            OTP.purpose == "password_reset_link",
            OTP.code_hash == hash_token(token),
            OTP.email == email.lower(),
        ).order_by(OTP.id.desc())
    )
    if not rec or rec.used or rec.expires_at < utc_now():
        return {"valid": False, "message": "Reset link is invalid or expired"}
    return {"valid": True, "email": rec.email}


# Demo accounts allowed for one-click passwordless login (for presentations only)
DEMO_EMAILS = {
    "student@jnn.edu.in",
    "principal@jnn.edu.in",
    "incharge@jnn.edu.in",
    "hod.aids@jnn.edu.in",
    "warden@jnn.edu.in",
    "security@jnn.edu.in",
}

@router.post("/auth/demo-login")
def demo_login(body: EmailOnly, db: Session = Depends(get_db)):
    """One-click demo login — no password or OTP required. Only works for seeded demo accounts."""
    email = str(body.email).lower().strip()
    if email not in DEMO_EMAILS:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This email is not a demo account")
    user = db.scalar(select(User).where(User.email == email))
    if not user or not user.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Demo account not found. Please run seed.py first.")
    return {"access_token": jwt_for(user), "token_type": "bearer", "role": user.role.value, "name": user.full_name}


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    student_profile = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
    staff_profile = db.scalar(select(StaffProfile).where(StaffProfile.user_id == user.id))
    dept = db.get(Department, staff_profile.department_id) if staff_profile and staff_profile.department_id else None
    yr = db.get(AcademicYear, staff_profile.year_id) if staff_profile and staff_profile.year_id else None
    sec = db.get(Section, staff_profile.section_id) if staff_profile and staff_profile.section_id else None
    return {
        "id": user.id,
        "name": user.full_name,
        "email": user.email,
        "role": user.role.value,
        "profile_completion": calculate_completion(student_profile) if student_profile else None,
        "student_id": student_profile.student_id if student_profile else None,
        "staff_profile": {
            "employee_id": staff_profile.employee_id if staff_profile else None,
            "phone": staff_profile.phone if staff_profile else None,
            "designation": staff_profile.designation if staff_profile else None,
            "department": dept.name if dept else None,
            "department_id": staff_profile.department_id if staff_profile else None,
            "year": yr.name if yr else None,
            "year_id": staff_profile.year_id if staff_profile else None,
            "section": sec.name if sec else None,
            "section_id": staff_profile.section_id if staff_profile else None,
        } if staff_profile else None,
    }


@router.get("/staff/me/profile")
def get_staff_profile(user: User = Depends(require(Role.CLASS_INCHARGE, Role.HOD, Role.PRINCIPAL, Role.WARDEN, Role.SECURITY)), db: Session = Depends(get_db)):
    sp = db.scalar(select(StaffProfile).where(StaffProfile.user_id == user.id))
    if not sp:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff profile not found")
    dept = db.get(Department, sp.department_id) if sp.department_id else None
    yr = db.get(AcademicYear, sp.year_id) if sp.year_id else None
    sec = db.get(Section, sp.section_id) if sp.section_id else None
    return {
        "employee_id": sp.employee_id,
        "phone": sp.phone,
        "designation": sp.designation,
        "department": dept.name if dept else None,
        "department_id": sp.department_id,
        "year": yr.name if yr else None,
        "year_id": sp.year_id,
        "section": sec.name if sec else None,
        "section_id": sp.section_id,
    }


@router.put("/staff/me/profile")
def update_staff_profile(body: StaffProfileUpdate, user: User = Depends(require(Role.CLASS_INCHARGE, Role.HOD, Role.PRINCIPAL, Role.WARDEN, Role.SECURITY)), db: Session = Depends(get_db)):
    sp = db.scalar(select(StaffProfile).where(StaffProfile.user_id == user.id))
    if not sp:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff profile not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(sp, k, v)
    db.commit()
    return {"message": "Staff profile updated successfully"}


@router.get("/class-incharge/students")
def incharge_students(user: User = Depends(require(Role.CLASS_INCHARGE)), db: Session = Depends(get_db)):
    """Returns students belonging to this class incharge's specific section."""
    sp = db.scalar(select(StaffProfile).where(StaffProfile.user_id == user.id))
    if not sp or not sp.section_id:
        # Fall back: return students from any section where this user is incharge
        sections = db.scalars(select(Section).where(Section.class_incharge_user_id == user.id)).all()
        if not sections:
            return []
        section_ids = [s.id for s in sections]
    else:
        section_ids = [sp.section_id]

    students_q = (
        select(StudentProfile, User)
        .join(User, User.id == StudentProfile.user_id)
        .where(StudentProfile.section_id.in_(section_ids))
        .order_by(StudentProfile.student_id)
    )
    results = []
    for stu, usr in db.execute(students_q).all():
        dept = db.get(Department, stu.department_id) if stu.department_id else None
        yr = db.get(AcademicYear, stu.year_id) if stu.year_id else None
        sec = db.get(Section, stu.section_id) if stu.section_id else None
        results.append({
            "id": usr.id,
            "full_name": usr.full_name,
            "email": usr.email,
            "student_id": stu.student_id,
            "phone": stu.phone,
            "department": dept.name if dept else None,
            "year": yr.name if yr else None,
            "section": sec.name if sec else None,
            "cgpa": stu.cgpa,
            "arrears": stu.arrears,
            "accommodation": stu.accommodation,
        })
    return results


@router.get("/hod/students")
def hod_students(user: User = Depends(require(Role.HOD)), db: Session = Depends(get_db)):
    """Returns all students in the HOD's department, grouped by year and section."""
    sp = db.scalar(select(StaffProfile).where(StaffProfile.user_id == user.id))
    if not sp or not sp.department_id:
        # Fall back: check department where this user is HOD
        dept = db.scalar(select(Department).where(Department.hod_user_id == user.id))
        if not dept:
            return {"department": None, "years": []}
        dept_id = dept.id
    else:
        dept_id = sp.department_id
        dept = db.get(Department, dept_id)

    years = db.scalars(select(AcademicYear).where(AcademicYear.department_id == dept_id).order_by(AcademicYear.id)).all()
    result_years = []
    for yr in years:
        sems = db.scalars(select(Semester).where(Semester.year_id == yr.id)).all()
        sections_data = []
        seen_sections = set()
        for sm in sems:
            secs = db.scalars(select(Section).where(Section.semester_id == sm.id)).all()
            for sec in secs:
                if sec.id in seen_sections:
                    continue
                seen_sections.add(sec.id)
                incharge_user = db.get(User, sec.class_incharge_user_id) if sec.class_incharge_user_id else None
                students_q = (
                    select(StudentProfile, User)
                    .join(User, User.id == StudentProfile.user_id)
                    .where(StudentProfile.year_id == yr.id, StudentProfile.section_id == sec.id)
                    .order_by(StudentProfile.student_id)
                )
                stu_list = []
                for stu, usr in db.execute(students_q).all():
                    stu_list.append({
                        "id": usr.id,
                        "full_name": usr.full_name,
                        "email": usr.email,
                        "student_id": stu.student_id,
                        "phone": stu.phone,
                        "cgpa": stu.cgpa,
                        "arrears": stu.arrears,
                        "accommodation": stu.accommodation,
                        "section": sec.name,
                    })
                sections_data.append({
                    "section_id": sec.id,
                    "section_name": sec.name,
                    "class_incharge": incharge_user.full_name if incharge_user else None,
                    "students": stu_list,
                    "student_count": len(stu_list),
                })
        result_years.append({
            "year_id": yr.id,
            "year_name": yr.name,
            "sections": sections_data,
        })
    return {
        "department": dept.name if dept else None,
        "department_id": dept_id,
        "years": result_years,
    }


@router.get("/student/profile")
def get_profile(user: User = Depends(require(Role.STUDENT)), db: Session = Depends(get_db)):
    p = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    return {
        "profile": {c.name: getattr(p, c.name) for c in p.__table__.columns},
        "completion": calculate_completion(p),
    }


@router.put("/student/profile")
def update_profile(body: ProfileUpdate, user: User = Depends(require(Role.STUDENT)), db: Session = Depends(get_db)):
    p = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")

    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    db.commit()
    return {"completion": calculate_completion(p), "message": "Profile saved successfully"}


@router.post("/phone-verify/send")
def send_phone_otp(
    body: PhoneOTPSend,
    user: User = Depends(require(Role.STUDENT)),
    db: Session = Depends(get_db),
):
    """Send a 6-digit OTP to the student's registered email to verify a phone number.
    The phone number is embedded in the OTP purpose so the OTP is bound to that exact number.
    purpose must be 'student_phone' or 'guardian_phone'.
    """
    if body.purpose not in ("student_phone", "guardian_phone"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "purpose must be student_phone or guardian_phone")

    # Embed phone in purpose so OTP is bound to the exact number (prevents number swapping)
    otp_purpose = f"ph:{body.purpose}:{body.phone.strip()}"
    if len(otp_purpose) > 60:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Phone number too long")

    # Invalidate any previous unused OTP for this purpose
    for old in db.scalars(
        select(OTP).where(OTP.email == user.email, OTP.purpose == otp_purpose, OTP.used == False)
    ).all():
        old.used = True

    raw = f"{secrets.randbelow(1000000):06d}"
    db.add(OTP(
        email=user.email,
        purpose=otp_purpose,
        code_hash=hash_token(raw),
        expires_at=utc_now() + timedelta(minutes=10),
    ))
    db.commit()

    label = "student" if body.purpose == "student_phone" else "guardian"
    delivery = send_otp_email(
        recipient=user.email,
        code=raw,
        purpose=f"{label} phone verification ({body.phone})",
        settings=get_settings(),
    )
    expose = get_settings().expose_otp_in_local_response or delivery == "virtual"
    return {
        "message": f"OTP sent to {user.email} to verify {label} phone number",
        "email_delivery": delivery,
        "development_otp": raw if expose else None,
    }


@router.post("/phone-verify/verify")
def verify_phone_otp(
    body: PhoneOTPVerify,
    user: User = Depends(require(Role.STUDENT)),
    db: Session = Depends(get_db),
):
    """Verify the OTP sent to the student's email for a given phone number.
    Returns a verify_token the client must include when saving the profile.
    """
    if body.purpose not in ("student_phone", "guardian_phone"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid purpose")

    otp_purpose = f"ph:{body.purpose}:{body.phone.strip()}"
    rec = db.scalar(
        select(OTP)
        .where(OTP.email == user.email, OTP.purpose == otp_purpose, OTP.used == False)
        .order_by(OTP.id.desc())
    )
    if not rec or rec.expires_at < utc_now():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "OTP expired or not found. Please request a new one.")
    if rec.code_hash != hash_token(body.code):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Incorrect OTP")

    rec.used = True
    db.commit()
    return {"verified": True, "phone": body.phone.strip(), "purpose": body.purpose}


@router.post("/gate-passes")
def create_pass(body: PassCreate, user: User = Depends(require(Role.STUDENT)), db: Session = Depends(get_db)):
    p = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    if calculate_completion(p) < 100:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Complete your profile (100%) before requesting a gate pass")

    # Normalize to naive UTC datetimes for consistent DB storage
    exit_dt = body.exit_at.astimezone(timezone.utc).replace(tzinfo=None) if body.exit_at.tzinfo else body.exit_at
    return_dt = body.return_at.astimezone(timezone.utc).replace(tzinfo=None) if body.return_at.tzinfo else body.return_at

    now = utc_now()
    if return_dt <= exit_dt:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Expected return time must be after exit time")
    if exit_dt < now - timedelta(minutes=15):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Exit time cannot be in the past")

    gid = f"GP-{now.year}-{secrets.randbelow(1000000):06d}"
    is_emergency = bool(body.is_emergency)
    emergency_reason = (body.emergency_reason or body.reason).strip() if is_emergency else None

    gate = GatePass(
        gate_pass_id=gid,
        student_id=p.id,
        reason=body.reason,
        guardian_name=p.guardian_name or "",
        guardian_phone=p.guardian_phone or "",
        exit_at=exit_dt,
        return_at=return_dt,
        status=PassStatus.PENDING_CLASS_INCHARGE,
        is_emergency=is_emergency,
        emergency_reason=emergency_reason,
        created_at=now,
    )
    db.add(gate)
    db.commit()

    if is_emergency:
        # Collect alert recipients: Class Incharge, HOD, and Principal
        recipients = []
        dept_name = "Department"
        sec_name = "Section"
        if p.section_id:
            sec = db.get(Section, p.section_id)
            if sec:
                sec_name = sec.name
                if sec.class_incharge_user_id:
                    ci_u = db.get(User, sec.class_incharge_user_id)
                    if ci_u and ci_u.email:
                        recipients.append(ci_u.email)
        if p.department_id:
            dept = db.get(Department, p.department_id)
            if dept:
                dept_name = dept.name
                if dept.hod_user_id:
                    hod_u = db.get(User, dept.hod_user_id)
                    if hod_u and hod_u.email:
                        recipients.append(hod_u.email)
                hod_staffs = db.scalars(
                    select(User).join(StaffProfile, StaffProfile.user_id == User.id).where(
                        StaffProfile.department_id == dept.id,
                        User.role == Role.HOD,
                    )
                ).all()
                for hs in hod_staffs:
                    if hs.email:
                        recipients.append(hs.email)

        principals = db.scalars(
            select(User).where(User.role.in_([Role.PRINCIPAL, Role.ADMIN]), User.college_id == user.college_id)
        ).all()
        for pr in principals:
            if pr.email:
                recipients.append(pr.email)

        send_emergency_alert_email(
            recipients=recipients,
            student_name=user.full_name,
            student_id=p.student_id or "",
            department_name=dept_name,
            section_name=sec_name,
            reason=emergency_reason or body.reason,
            exit_at_str=to_iso_utc(exit_dt) or "",
            return_at_str=to_iso_utc(return_dt) or "",
            gate_pass_id=gid,
            settings=get_settings(),
        )

    return {"gate_pass_id": gid, "status": gate.status.value, "id": gate.id, "is_emergency": is_emergency}


@router.get("/gate-passes")
def list_passes(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role == Role.STUDENT:
        p = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
        if not p:
            return []
        rows = db.scalars(select(GatePass).where(GatePass.student_id == p.id).order_by(GatePass.id.desc())).all()
    elif user.role == Role.CLASS_INCHARGE:
        # Only show passes from students in their section(s)
        sp = db.scalar(select(StaffProfile).where(StaffProfile.user_id == user.id))
        if sp and sp.section_id:
            section_ids = [sp.section_id]
        else:
            incharge_sections = db.scalars(select(Section).where(Section.class_incharge_user_id == user.id)).all()
            section_ids = [s.id for s in incharge_sections]
        if section_ids:
            student_profile_ids = db.scalars(
                select(StudentProfile.id).where(StudentProfile.section_id.in_(section_ids))
            ).all()
            rows = db.scalars(
                select(GatePass).where(GatePass.student_id.in_(student_profile_ids)).order_by(GatePass.id.desc())
            ).all()
        else:
            rows = db.scalars(select(GatePass).order_by(GatePass.id.desc())).all()
    elif user.role == Role.HOD:
        # Show passes from students in HOD's department
        sp = db.scalar(select(StaffProfile).where(StaffProfile.user_id == user.id))
        dept_id = sp.department_id if sp else None
        if not dept_id:
            dept_obj = db.scalar(select(Department).where(Department.hod_user_id == user.id))
            dept_id = dept_obj.id if dept_obj else None
        if dept_id:
            student_profile_ids = db.scalars(
                select(StudentProfile.id).where(StudentProfile.department_id == dept_id)
            ).all()
            rows = db.scalars(
                select(GatePass).where(GatePass.student_id.in_(student_profile_ids)).order_by(GatePass.id.desc())
            ).all()
        else:
            rows = db.scalars(select(GatePass).order_by(GatePass.id.desc())).all()
    else:
        rows = db.scalars(select(GatePass).order_by(GatePass.id.desc())).all()

    now = utc_now()
    result = []
    for g in rows:
        p = db.get(StudentProfile, g.student_id)
        student_user = db.get(User, p.user_id) if p else None

        activation_time = (g.exit_at - timedelta(minutes=10)) if g.exit_at else None
        is_early = bool(activation_time and now < activation_time)
        is_expired = bool(g.qr_expires_at and now > g.qr_expires_at)
        is_active = False

        if g.status == PassStatus.QR_GENERATED:
            is_active = bool(not is_early and not is_expired)
        elif g.status == PassStatus.EXITED:
            is_active = not is_expired

        ext_count = db.scalar(select(func.count(ExtensionLog.id)).where(ExtensionLog.gate_pass_id == g.id)) or 0
        pend_req = db.scalar(
            select(ExtensionRequest)
            .where(ExtensionRequest.gate_pass_id == g.id, ExtensionRequest.status == "PENDING")
            .order_by(ExtensionRequest.id.desc())
        )
        pending_extension_data = {
            "id": pend_req.id,
            "extension_minutes": pend_req.extension_minutes,
            "reason": pend_req.reason,
            "status": pend_req.status,
            "created_at": to_iso_utc(pend_req.created_at),
            "projected_return_at": to_iso_utc(g.return_at + timedelta(minutes=pend_req.extension_minutes)),
            "projected_qr_expires_at": to_iso_utc(g.return_at + timedelta(minutes=pend_req.extension_minutes + 30)),
        } if pend_req else None

        item = {
            "id": g.id,
            "gate_pass_id": g.gate_pass_id,
            "reason": g.reason,
            "status": g.status.value,
            "is_active": is_active,
            "is_early": is_early,
            "is_expired": is_expired,
            "exit_at": to_iso_utc(g.exit_at),
            "qr_activates_at": to_iso_utc(activation_time),
            "return_at": to_iso_utc(g.return_at),
            "created_at": to_iso_utc(g.created_at),
            "student_name": student_user.full_name if student_user else "Student",
            "student_id": p.student_id if p else "",
            "guardian_phone": g.guardian_phone,
            "guardian_name": g.guardian_name,
            "is_emergency": bool(g.is_emergency),
            "emergency_reason": g.emergency_reason,
            "qr_token": g.qr_token if g.status in {PassStatus.QR_GENERATED, PassStatus.EXITED} else None,
            "qr_expires_at": to_iso_utc(g.qr_expires_at),
            "extension_count": ext_count,
            "pending_extension": pending_extension_data,
            "seconds_until_activation": max(0, int((activation_time - now).total_seconds())) if is_early else 0,
            "seconds_until_expiry": max(0, int((g.qr_expires_at - now).total_seconds())) if (g.qr_expires_at and g.qr_expires_at > now) else 0,
        }
        result.append(item)
    return result


@router.get("/gate-passes/{pass_id}")
def get_pass_details(pass_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    g = db.get(GatePass, pass_id)
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gate pass not found")
    p = db.get(StudentProfile, g.student_id)
    student_user = db.get(User, p.user_id) if p else None
    approvals = db.scalars(select(Approval).where(Approval.gate_pass_id == g.id).order_by(Approval.id)).all()

    now = utc_now()
    activation_time = (g.exit_at - timedelta(minutes=10)) if g.exit_at else None
    is_early = bool(activation_time and now < activation_time)
    is_expired = bool(g.qr_expires_at and now > g.qr_expires_at)
    is_active = False

    if g.status == PassStatus.QR_GENERATED:
        is_active = bool(not is_early and not is_expired)
    elif g.status == PassStatus.EXITED:
        is_active = not is_expired

    extensions = db.scalars(
        select(ExtensionLog).where(ExtensionLog.gate_pass_id == g.id).order_by(ExtensionLog.id.desc())
    ).all()

    pend_req = db.scalar(
        select(ExtensionRequest)
        .where(ExtensionRequest.gate_pass_id == g.id, ExtensionRequest.status == "PENDING")
        .order_by(ExtensionRequest.id.desc())
    )
    pending_extension_data = {
        "id": pend_req.id,
        "extension_minutes": pend_req.extension_minutes,
        "reason": pend_req.reason,
        "status": pend_req.status,
        "created_at": to_iso_utc(pend_req.created_at),
        "projected_return_at": to_iso_utc(g.return_at + timedelta(minutes=pend_req.extension_minutes)),
        "projected_qr_expires_at": to_iso_utc(g.return_at + timedelta(minutes=pend_req.extension_minutes + 30)),
    } if pend_req else None

    all_reqs = db.scalars(
        select(ExtensionRequest).where(ExtensionRequest.gate_pass_id == g.id).order_by(ExtensionRequest.id.desc())
    ).all()
    reqs_list = []
    for r in all_reqs:
        reviewer = db.get(User, r.reviewed_by_id) if r.reviewed_by_id else None
        reqs_list.append({
            "id": r.id,
            "extension_minutes": r.extension_minutes,
            "reason": r.reason,
            "status": r.status,
            "created_at": to_iso_utc(r.created_at),
            "reviewed_by": reviewer.full_name if reviewer else None,
            "reviewed_role": reviewer.role.value if reviewer else None,
            "review_remarks": r.review_remarks,
            "reviewed_at": to_iso_utc(r.reviewed_at),
        })

    return {
        "id": g.id,
        "gate_pass_id": g.gate_pass_id,
        "reason": g.reason,
        "status": g.status.value,
        "is_active": is_active,
        "is_early": is_early,
        "is_expired": is_expired,
        "exit_at": to_iso_utc(g.exit_at),
        "qr_activates_at": to_iso_utc(activation_time),
        "return_at": to_iso_utc(g.return_at),
        "created_at": to_iso_utc(g.created_at),
        "student_name": student_user.full_name if student_user else "Student",
        "student_id": p.student_id if p else "",
        "guardian_phone": g.guardian_phone,
        "guardian_name": g.guardian_name,
        "is_emergency": bool(g.is_emergency),
        "emergency_reason": g.emergency_reason,
        "qr_token": g.qr_token if g.status in {PassStatus.QR_GENERATED, PassStatus.EXITED} else None,
        "qr_expires_at": to_iso_utc(g.qr_expires_at),
        "extension_count": len(extensions),
        "pending_extension": pending_extension_data,
        "extension_requests": reqs_list,
        "seconds_until_activation": max(0, int((activation_time - now).total_seconds())) if is_early else 0,
        "seconds_until_expiry": max(0, int((g.qr_expires_at - now).total_seconds())) if (g.qr_expires_at and g.qr_expires_at > now) else 0,
        "extensions": [
            {
                "id": e.id,
                "extension_minutes": e.extension_minutes,
                "previous_return_at": to_iso_utc(e.previous_return_at),
                "new_return_at": to_iso_utc(e.new_return_at),
                "previous_qr_expires_at": to_iso_utc(e.previous_qr_expires_at),
                "new_qr_expires_at": to_iso_utc(e.new_qr_expires_at),
                "reason": e.reason,
                "created_at": to_iso_utc(e.created_at),
            }
            for e in extensions
        ],
        "approvals": [
            {
                "role": a.role.value,
                "decision": a.decision,
                "remarks": a.remarks,
                "created_at": to_iso_utc(a.created_at),
            }
            for a in approvals
        ],
    }


def is_allowed_approver(g: GatePass, user: User, db: Session) -> bool:
    if user.role in {Role.PRINCIPAL, Role.ADMIN}:
        return True
    p = db.get(StudentProfile, g.student_id)
    if not p:
        return False
    if user.role == Role.CLASS_INCHARGE:
        if not p.section_id:
            return True
        sp = db.scalar(select(StaffProfile).where(StaffProfile.user_id == user.id))
        if sp and sp.section_id and sp.section_id == p.section_id:
            return True
        sec = db.get(Section, p.section_id)
        return sec is None or sec.class_incharge_user_id is None or sec.class_incharge_user_id == user.id
    if user.role == Role.HOD:
        if not p.department_id:
            return True
        sp = db.scalar(select(StaffProfile).where(StaffProfile.user_id == user.id))
        if sp and sp.department_id and sp.department_id == p.department_id:
            return True
        dept = db.get(Department, p.department_id)
        return dept is None or dept.hod_user_id is None or dept.hod_user_id == user.id
    if user.role == Role.WARDEN:
        if not p.hostel_block_id:
            return True
        block = db.get(HostelBlock, p.hostel_block_id)
        return block is None or block.warden_user_id is None or block.warden_user_id == user.id
    return False



@router.post("/gate-passes/{pass_id}/decision")
def decide(
    pass_id: int,
    body: Decision,
    user: User = Depends(require(Role.CLASS_INCHARGE, Role.HOD, Role.PRINCIPAL, Role.WARDEN, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    g = db.get(GatePass, pass_id)
    if not g or not is_allowed_approver(g, user, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized to review this request")

    raw_token = None
    if g.is_emergency:
        # Emergency gate pass workflow:
        # Principal, Admin, HOD, and Class Incharge can all act while pass is pending
        if not g.status.value.startswith("PENDING"):
            raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot act on pass in {g.status.value} status")

        allowed_emergency_roles = {Role.CLASS_INCHARGE, Role.HOD, Role.PRINCIPAL, Role.ADMIN}
        if user.role not in allowed_emergency_roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Role not authorized for emergency pass review")

        db.add(Approval(gate_pass_id=g.id, approver_id=user.id, role=user.role, decision=body.decision, remarks=body.remarks, created_at=utc_now()))

        if body.decision == "REJECT":
            g.status = PassStatus.REJECTED
        else:
            # "and then anyone in hod or principal accepts they can get gate pass"
            if user.role in {Role.HOD, Role.PRINCIPAL, Role.ADMIN}:
                g.status = PassStatus.QR_GENERATED
                raw_token = token()
                g.qr_token = raw_token
                g.qr_token_hash = hash_token(raw_token)
                g.qr_expires_at = g.return_at + timedelta(minutes=30)
            elif user.role == Role.CLASS_INCHARGE:
                # Class Incharge endorses/approves: moves to PENDING_HOD for HOD or Principal instant clearance
                g.status = PassStatus.PENDING_HOD
            else:
                g.status = PassStatus.QR_GENERATED
                raw_token = token()
                g.qr_token = raw_token
                g.qr_token_hash = hash_token(raw_token)
                g.qr_expires_at = g.return_at + timedelta(minutes=30)
    else:
        expected = {
            PassStatus.PENDING_CLASS_INCHARGE: {Role.CLASS_INCHARGE, Role.PRINCIPAL, Role.ADMIN},
            PassStatus.PENDING_HOD: {Role.HOD, Role.PRINCIPAL, Role.ADMIN},
            PassStatus.PENDING_PRINCIPAL: {Role.PRINCIPAL, Role.ADMIN},
            PassStatus.PENDING_WARDEN: {Role.WARDEN, Role.PRINCIPAL, Role.ADMIN},
        }
        allowed_roles = expected.get(g.status, set())
        if user.role not in allowed_roles:
            raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot act on pass in {g.status.value} status")

        db.add(Approval(gate_pass_id=g.id, approver_id=user.id, role=user.role, decision=body.decision, remarks=body.remarks, created_at=utc_now()))

        if body.decision == "REJECT":
            g.status = PassStatus.REJECTED
        elif g.status == PassStatus.PENDING_CLASS_INCHARGE:
            g.status = PassStatus.PENDING_HOD
        elif g.status == PassStatus.PENDING_HOD:
            if user.role in {Role.PRINCIPAL, Role.ADMIN}:
                p = db.get(StudentProfile, g.student_id)
                g.status = PassStatus.PENDING_WARDEN if (p and p.accommodation == "HOSTELLER") else PassStatus.QR_GENERATED
            else:
                g.status = PassStatus.PENDING_PRINCIPAL
        elif g.status == PassStatus.PENDING_PRINCIPAL:
            p = db.get(StudentProfile, g.student_id)
            if p and p.accommodation == "HOSTELLER":
                g.status = PassStatus.PENDING_WARDEN
            else:
                g.status = PassStatus.QR_GENERATED
        else:
            g.status = PassStatus.QR_GENERATED

        if g.status == PassStatus.QR_GENERATED:
            raw_token = token()
            g.qr_token = raw_token
            g.qr_token_hash = hash_token(raw_token)
            # QR code expires exactly 30 minutes after expected return time
            g.qr_expires_at = g.return_at + timedelta(minutes=30)

    db.commit()
    return {"status": g.status.value, "qr_token": raw_token, "qr_expires_at": to_iso_utc(g.qr_expires_at)}


@router.post("/gate-passes/{pass_id}/request-extension")
def request_pass_extension(
    pass_id: int,
    body: PassExtend,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    g = db.get(GatePass, pass_id)
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gate pass not found")

    # Only active passes (QR_GENERATED or EXITED) can have their validity extended
    if g.status not in {PassStatus.QR_GENERATED, PassStatus.EXITED}:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot extend validity for a pass with status {g.status.value}. Only active QR or exited passes can be extended."
        )

    # Authorization: Student who owns the pass, or Staff
    if user.role == Role.STUDENT:
        student_prof = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
        if not student_prof or student_prof.id != g.student_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized to request extension for this gate pass")
    else:
        student_prof = db.get(StudentProfile, g.student_id)
        if not student_prof:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Student profile not found")

    # Check if an extension request is already PENDING
    existing_pending = db.scalar(
        select(ExtensionRequest).where(
            ExtensionRequest.gate_pass_id == g.id,
            ExtensionRequest.status == "PENDING",
        )
    )
    if existing_pending:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"An extension request for +{existing_pending.extension_minutes} minutes is already pending approval from Class Incharge, HOD, or Principal.",
        )

    req = ExtensionRequest(
        gate_pass_id=g.id,
        student_id=student_prof.id,
        extension_minutes=body.extension_minutes,
        reason=body.reason.strip(),
        status="PENDING",
        created_at=utc_now(),
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    projected_return = g.return_at + timedelta(minutes=body.extension_minutes)
    projected_qr_expires = projected_return + timedelta(minutes=30)

    return {
        "success": True,
        "message": f"Validity extension request of +{body.extension_minutes} minutes submitted successfully. Awaiting approval from Class Incharge, HOD, or Principal.",
        "status": "PENDING_APPROVAL",
        "gate_pass_id": g.gate_pass_id,
        "request_id": req.id,
        "extension_minutes": req.extension_minutes,
        "reason": req.reason,
        "created_at": to_iso_utc(req.created_at),
        "current_return_at": to_iso_utc(g.return_at),
        "projected_return_at": to_iso_utc(projected_return),
        "projected_qr_expires_at": to_iso_utc(projected_qr_expires),
        "valid_until": to_iso_utc(g.qr_expires_at),
        "qr_expires_at": to_iso_utc(g.qr_expires_at),
        "return_at": to_iso_utc(g.return_at),
    }


@router.post("/gate-passes/{pass_id}/extend")
def extend_pass(
    pass_id: int,
    body: PassExtend,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    # When student triggers extension, create a request requiring faculty approval
    if user.role == Role.STUDENT:
        return request_pass_extension(pass_id, body, user, db)

    # Faculty / Staff / Admin direct extension override
    g = db.get(GatePass, pass_id)
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gate pass not found")

    if g.status not in {PassStatus.QR_GENERATED, PassStatus.EXITED}:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot extend validity for a pass with status {g.status.value}. Only active QR or exited passes can be extended."
        )

    if not is_allowed_approver(g, user, db) and user.role not in {Role.SECURITY}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized to extend gate passes")

    # Security officers can extend only up to 45 minutes (specifically 30 mins or 45 mins)
    # Extensions of 1 hour or more must be approved by Class Incharge, HOD, or Principal
    if user.role == Role.SECURITY and body.extension_minutes > 45:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Security officers can only grant validity extensions up to 45 minutes (30 mins or 45 mins). "
            "Extensions of 1 hour or more must be approved by Class Incharge, HOD, or Principal."
        )

    previous_return = g.return_at
    previous_qr_expires = g.qr_expires_at

    new_return = previous_return + timedelta(minutes=body.extension_minutes)
    new_qr_expires = new_return + timedelta(minutes=30)

    g.return_at = new_return
    g.qr_expires_at = new_qr_expires

    ext = ExtensionLog(
        gate_pass_id=g.id,
        extended_by_id=user.id,
        extension_minutes=body.extension_minutes,
        previous_return_at=previous_return,
        new_return_at=new_return,
        previous_qr_expires_at=previous_qr_expires,
        new_qr_expires_at=new_qr_expires,
        reason=body.reason,
        created_at=utc_now(),
    )
    db.add(ext)

    # Automatically approve any pending request on this pass
    pending_req = db.scalar(
        select(ExtensionRequest).where(
            ExtensionRequest.gate_pass_id == g.id,
            ExtensionRequest.status == "PENDING",
        )
    )
    if pending_req:
        pending_req.status = "APPROVED"
        pending_req.reviewed_by_id = user.id
        pending_req.review_remarks = f"Directly extended and approved by {user.role.value}"
        pending_req.reviewed_at = utc_now()

    db.add(
        Approval(
            gate_pass_id=g.id,
            approver_id=user.id,
            role=user.role,
            decision="EXTENSION_APPROVED",
            remarks=f"Directly extended return validity by {body.extension_minutes}m: {body.reason}",
            created_at=utc_now(),
        )
    )

    db.commit()
    db.refresh(g)

    now = utc_now()
    activation_time = (g.exit_at - timedelta(minutes=10)) if g.exit_at else None
    is_early = bool(activation_time and now < activation_time)
    is_expired = bool(g.qr_expires_at and now > g.qr_expires_at)
    is_active = False
    if g.status == PassStatus.QR_GENERATED:
        is_active = bool(not is_early and not is_expired)
    elif g.status == PassStatus.EXITED:
        is_active = not is_expired

    ext_count = db.scalar(select(func.count(ExtensionLog.id)).where(ExtensionLog.gate_pass_id == g.id)) or 1

    return {
        "success": True,
        "message": f"Gate pass validity successfully extended by {body.extension_minutes} minutes.",
        "gate_pass_id": g.gate_pass_id,
        "status": g.status.value,
        "exit_at": to_iso_utc(g.exit_at),
        "qr_activates_at": to_iso_utc(activation_time),
        "return_at": to_iso_utc(g.return_at),
        "valid_until": to_iso_utc(g.qr_expires_at),
        "qr_expires_at": to_iso_utc(g.qr_expires_at),
        "is_active": is_active,
        "is_early": is_early,
        "is_expired": is_expired,
        "extension_minutes": body.extension_minutes,
        "extension_count": ext_count,
        "seconds_until_activation": max(0, int((activation_time - now).total_seconds())) if is_early else 0,
        "seconds_until_expiry": max(0, int((g.qr_expires_at - now).total_seconds())) if (g.qr_expires_at and g.qr_expires_at > now) else 0,
    }


@router.get("/extension-requests")
def list_extension_requests(
    status: str | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """List extension requests for Class Incharge, HOD, Principal, Warden, Admin, or Student."""
    if user.role == Role.STUDENT:
        student_prof = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
        if not student_prof:
            return []
        query = select(ExtensionRequest).where(ExtensionRequest.student_id == student_prof.id)
    elif user.role == Role.CLASS_INCHARGE:
        sp = db.scalar(select(StaffProfile).where(StaffProfile.user_id == user.id))
        sec_ids = [sp.section_id] if (sp and sp.section_id) else []
        incharge_secs = db.scalars(select(Section.id).where(Section.class_incharge_user_id == user.id)).all()
        all_sec_ids = set(sec_ids) | set(incharge_secs)
        if all_sec_ids:
            student_ids = db.scalars(select(StudentProfile.id).where(StudentProfile.section_id.in_(all_sec_ids))).all()
            query = select(ExtensionRequest).where(ExtensionRequest.student_id.in_(student_ids))
        else:
            query = select(ExtensionRequest)
    elif user.role == Role.HOD:
        sp = db.scalar(select(StaffProfile).where(StaffProfile.user_id == user.id))
        dept_id = sp.department_id if (sp and sp.department_id) else None
        if not dept_id:
            dept_obj = db.scalar(select(Department).where(Department.hod_user_id == user.id))
            dept_id = dept_obj.id if dept_obj else None
        if dept_id:
            student_ids = db.scalars(select(StudentProfile.id).where(StudentProfile.department_id == dept_id)).all()
            query = select(ExtensionRequest).where(ExtensionRequest.student_id.in_(student_ids))
        else:
            query = select(ExtensionRequest)
    elif user.role in {Role.PRINCIPAL, Role.ADMIN, Role.WARDEN}:
        query = select(ExtensionRequest)
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized to view extension requests")

    if status:
        query = query.where(ExtensionRequest.status == status.upper())

    reqs = db.scalars(query.order_by(ExtensionRequest.id.desc())).all()

    results = []
    for r in reqs:
        g = db.get(GatePass, r.gate_pass_id)
        if not g:
            continue
        p = db.get(StudentProfile, r.student_id)
        st_user = db.get(User, p.user_id) if p else None
        dept = db.get(Department, p.department_id) if (p and p.department_id) else None
        year = db.get(AcademicYear, p.year_id) if (p and p.year_id) else None
        sec = db.get(Section, p.section_id) if (p and p.section_id) else None
        reviewer = db.get(User, r.reviewed_by_id) if r.reviewed_by_id else None

        results.append({
            "id": r.id,
            "gate_pass_id": g.id,
            "gate_pass_code": g.gate_pass_id,
            "student_name": st_user.full_name if st_user else "Student",
            "student_id": p.student_id if p else "",
            "department": dept.name if dept else "",
            "year": year.name if year else "",
            "section": sec.name if sec else "",
            "extension_minutes": r.extension_minutes,
            "reason": r.reason,
            "pass_reason": g.reason,
            "pass_status": g.status.value,
            "current_exit_at": to_iso_utc(g.exit_at),
            "current_return_at": to_iso_utc(g.return_at),
            "current_qr_expires_at": to_iso_utc(g.qr_expires_at),
            "new_return_at": to_iso_utc(g.return_at + timedelta(minutes=r.extension_minutes)),
            "new_qr_expires_at": to_iso_utc(g.return_at + timedelta(minutes=r.extension_minutes + 30)),
            "status": r.status,
            "created_at": to_iso_utc(r.created_at),
            "reviewed_by": reviewer.full_name if reviewer else None,
            "reviewed_role": reviewer.role.value if reviewer else None,
            "review_remarks": r.review_remarks,
            "reviewed_at": to_iso_utc(r.reviewed_at),
        })

    return results


@router.post("/extension-requests/{request_id}/decision")
def decide_extension_request(
    request_id: int,
    body: ExtensionDecision,
    user: User = Depends(require(Role.CLASS_INCHARGE, Role.HOD, Role.PRINCIPAL, Role.ADMIN, Role.WARDEN)),
    db: Session = Depends(get_db),
):
    """Class Incharge, HOD, Principal, or Admin accepts or rejects a student's extension request."""
    req = db.get(ExtensionRequest, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Extension request not found")

    if req.status != "PENDING":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Extension request is already {req.status.lower()}")

    g = db.get(GatePass, req.gate_pass_id)
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gate pass not found")

    if not is_allowed_approver(g, user, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized to review this extension request")

    req.reviewed_by_id = user.id
    req.reviewed_at = utc_now()
    req.review_remarks = body.remarks or ("Approved" if body.decision == "APPROVE" else "Rejected")

    if body.decision == "APPROVE":
        req.status = "APPROVED"

        previous_return = g.return_at
        previous_qr_expires = g.qr_expires_at

        new_return = previous_return + timedelta(minutes=req.extension_minutes)
        new_qr_expires = new_return + timedelta(minutes=30)

        g.return_at = new_return
        g.qr_expires_at = new_qr_expires

        ext = ExtensionLog(
            gate_pass_id=g.id,
            extended_by_id=user.id,
            extension_minutes=req.extension_minutes,
            previous_return_at=previous_return,
            new_return_at=new_return,
            previous_qr_expires_at=previous_qr_expires,
            new_qr_expires_at=new_qr_expires,
            reason=f"[{user.role.value} Approved] {req.reason}",
            created_at=utc_now(),
        )
        db.add(ext)

        db.add(
            Approval(
                gate_pass_id=g.id,
                approver_id=user.id,
                role=user.role,
                decision="EXTENSION_APPROVED",
                remarks=f"Approved +{req.extension_minutes}m extension by {user.role.value}: {body.remarks or req.reason}",
                created_at=utc_now(),
            )
        )
        message = f"Extension request approved by {user.role.value}. Validity extended by {req.extension_minutes} minutes."
    else:
        req.status = "REJECTED"
        db.add(
            Approval(
                gate_pass_id=g.id,
                approver_id=user.id,
                role=user.role,
                decision="EXTENSION_REJECTED",
                remarks=f"Rejected extension request by {user.role.value}: {body.remarks or 'No reason provided'}",
                created_at=utc_now(),
            )
        )
        message = f"Extension request rejected by {user.role.value}."

    db.commit()
    db.refresh(g)

    return {
        "success": True,
        "message": message,
        "status": req.status,
        "gate_pass_id": g.gate_pass_id,
        "return_at": to_iso_utc(g.return_at),
        "qr_expires_at": to_iso_utc(g.qr_expires_at),
        "valid_until": to_iso_utc(g.qr_expires_at),
    }


@router.post("/extension-requests/{request_id}/cancel")
def cancel_extension_request(
    request_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    req = db.get(ExtensionRequest, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Extension request not found")

    if req.status != "PENDING":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot cancel a request that is already {req.status.lower()}")

    if user.role == Role.STUDENT:
        student_prof = db.scalar(select(StudentProfile).where(StudentProfile.user_id == user.id))
        if not student_prof or student_prof.id != req.student_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized to cancel this extension request")
    elif user.role not in {Role.CLASS_INCHARGE, Role.HOD, Role.PRINCIPAL, Role.ADMIN}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized")

    req.status = "CANCELLED"
    req.review_remarks = "Cancelled by requester"
    req.reviewed_at = utc_now()
    db.commit()

    return {"success": True, "message": "Extension request cancelled."}



@router.post("/security/scan")
def scan(body: Scan, user: User = Depends(require(Role.SECURITY, Role.ADMIN)), db: Session = Depends(get_db)):
    tok_clean = body.token.strip()
    g = db.scalar(select(GatePass).where(GatePass.qr_token_hash == hash_token(tok_clean)))
    if not g:
        g = db.scalar(select(GatePass).where(GatePass.qr_token == tok_clean))
    if not g:
        g = db.scalar(select(GatePass).where(func.lower(GatePass.gate_pass_id) == tok_clean.lower()))
    if not g:
        p_match = db.scalar(select(StudentProfile).where(func.lower(StudentProfile.student_id) == tok_clean.lower()))
        if p_match:
            g = db.scalar(
                select(GatePass)
                .where(GatePass.student_id == p_match.id, GatePass.status.in_([PassStatus.QR_GENERATED, PassStatus.EXITED, PassStatus.RETURNED]))
                .order_by(GatePass.id.desc())
            )

    if not g:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Pass token or ID not found. Enter a valid QR token, Pass ID (e.g. GP-2026-xxxx), or Student Roll No.")

    if g.status not in {PassStatus.QR_GENERATED, PassStatus.EXITED, PassStatus.RETURNED}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Gate pass is in invalid status: {g.status.value}")

    p = db.get(StudentProfile, g.student_id)
    student = db.get(User, p.user_id) if p else None

    now = utc_now()
    activation_time = (g.exit_at - timedelta(minutes=10)) if g.exit_at else None
    is_early = bool(not g.is_emergency and activation_time and now < activation_time)
    is_expired = bool(g.qr_expires_at and now > g.qr_expires_at)
    
    can_exit = False
    can_return = False
    is_active = False
    status_message = ""

    if g.status == PassStatus.QR_GENERATED:
        if is_early:
            is_active = False
            can_exit = False
            status_message = f"Pass is not active yet. QR activates 10 minutes before scheduled departure ({to_iso_utc(activation_time)}). Early exit is not permitted."
        elif is_expired:
            is_active = False
            can_exit = False
            status_message = "Pass has expired (30 minutes past expected return). Student cannot exit."
        else:
            is_active = True
            can_exit = True
            status_message = "🚨 EMERGENCY PASS CLEARED: Student is approved for immediate emergency exit." if g.is_emergency else "Pass is active. Cleared for exit."
    elif g.status == PassStatus.EXITED:
        can_exit = False
        can_return = True
        if is_expired:
            is_active = False
            status_message = "⚠️ OVERDUE RETURN: Exceeded 30-minute window past expected return."
        else:
            is_active = True
            status_message = "Student outside campus. Cleared to record return."
    elif g.status == PassStatus.RETURNED:
        can_exit = False
        can_return = False
        is_active = False
        status_message = "Pass already completed. Student has already returned."

    ext_count = db.scalar(select(func.count(ExtensionLog.id)).where(ExtensionLog.gate_pass_id == g.id)) or 0

    return {
        "valid": True,
        "gate_pass_id": g.id,
        "pass_code": g.gate_pass_id,
        "status": g.status.value,
        "student_name": student.full_name if student else "Student",
        "student_id": p.student_id if p else "",
        "reason": g.reason,
        "is_emergency": bool(g.is_emergency),
        "emergency_reason": g.emergency_reason,
        "exit_at": to_iso_utc(g.exit_at),
        "qr_activates_at": to_iso_utc(activation_time),
        "return_at": to_iso_utc(g.return_at),
        "valid_until": to_iso_utc(g.qr_expires_at),
        "is_active": is_active,
        "is_early": is_early,
        "is_expired": is_expired,
        "can_exit": can_exit,
        "can_return": can_return,
        "status_message": status_message,
        "extension_count": ext_count,
        "seconds_until_activation": max(0, int((activation_time - now).total_seconds())) if is_early else 0,
        "seconds_until_expiry": max(0, int((g.qr_expires_at - now).total_seconds())) if (g.qr_expires_at and g.qr_expires_at > now) else 0,
    }


@router.post("/security/{pass_id}/exit")
def exit_pass(pass_id: int, user: User = Depends(require(Role.SECURITY, Role.ADMIN)), db: Session = Depends(get_db)):
    g = db.get(GatePass, pass_id)
    if not g or g.status != PassStatus.QR_GENERATED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Pass is not ready for exit or has already exited")
    
    now = utc_now()
    activation_time = g.exit_at - timedelta(minutes=10)
    if not g.is_emergency and now < activation_time:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Pass is not active yet. QR activates 10 minutes before departure at {to_iso_utc(activation_time)}. Early exit is not permitted."
        )
    if g.qr_expires_at and now > g.qr_expires_at:
        g.status = PassStatus.EXPIRED
        db.commit()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Pass expired at {to_iso_utc(g.qr_expires_at)} (30 minutes past expected return). Exit is not permitted."
        )

    g.status = PassStatus.EXITED
    db.add(ExitLog(gate_pass_id=g.id, security_user_id=user.id, exit_at=now, sync_status="RECORDED"))
    db.commit()

    # Notify parent via SMS
    _p_exit = db.get(StudentProfile, g.student_id)
    _s_exit = db.get(User, _p_exit.user_id) if _p_exit else None
    sms_status = send_exit_sms(
        guardian_name=g.guardian_name or "Parent",
        guardian_phone=g.guardian_phone or "",
        student_name=_s_exit.full_name if _s_exit else "Student",
        gate_pass_id=g.gate_pass_id,
        exit_at=now,
        return_at=g.return_at,
        reason=g.reason or "",
        settings=get_settings(),
    )
    return {"message": "Student exit recorded successfully", "status": g.status.value, "sms_status": sms_status}


@router.post("/security/{pass_id}/return")
def return_pass(pass_id: int, user: User = Depends(require(Role.SECURITY, Role.ADMIN)), db: Session = Depends(get_db)):
    g = db.get(GatePass, pass_id)
    if not g or g.status != PassStatus.EXITED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Pass has not exited yet")
    log = db.scalar(select(ExitLog).where(ExitLog.gate_pass_id == g.id).order_by(ExitLog.id.desc()))
    now = utc_now()
    is_overdue = bool(g.qr_expires_at and now > g.qr_expires_at)
    if log:
        log.return_at = now
        log.sync_status = "OVERDUE_COMPLETED" if is_overdue else "COMPLETED"
    g.status = PassStatus.RETURNED
    db.commit()

    # Notify parent via SMS
    p_ret = db.get(StudentProfile, g.student_id)
    student_ret = db.get(User, p_ret.user_id) if p_ret else None
    sms_status = send_return_sms(
        guardian_name=g.guardian_name or "Parent",
        guardian_phone=g.guardian_phone or "",
        student_name=student_ret.full_name if student_ret else "Student",
        gate_pass_id=g.gate_pass_id,
        returned_at=now,
        is_overdue=is_overdue,
        settings=get_settings(),
    )
    msg = "Student return recorded (OVERDUE: exceeded 30-min return window)" if is_overdue else "Student return recorded successfully"
    return {"message": msg, "status": g.status.value, "is_overdue": is_overdue, "sms_status": sms_status}


@router.get("/security/gate-logs")
def get_gate_logs(
    movement_filter: str = "ALL",  # ALL, CURRENTLY_OUT, EXIT, RETURN
    search: str | None = None,
    limit: int = 150,
    user: User = Depends(require(Role.SECURITY, Role.ADMIN, Role.PRINCIPAL, Role.WARDEN, Role.HOD, Role.CLASS_INCHARGE)),
    db: Session = Depends(get_db),
):
    """Retrieve full persistent gate movement logs with student and pass details."""
    query = (
        select(ExitLog, GatePass, StudentProfile, User)
        .join(GatePass, ExitLog.gate_pass_id == GatePass.id)
        .join(StudentProfile, GatePass.student_id == StudentProfile.id)
        .join(User, StudentProfile.user_id == User.id)
        .order_by(ExitLog.id.desc())
    )

    now = utc_now()
    all_rows = db.execute(query).all()

    # Pre-fetch security officer user names
    officer_ids = {row[0].security_user_id for row in all_rows if row[0].security_user_id}
    officers = {}
    if officer_ids:
        officer_users = db.scalars(select(User).where(User.id.in_(officer_ids))).all()
        officers = {u.id: u.full_name for u in officer_users}

    # Pre-fetch department names
    dept_ids = {row[2].department_id for row in all_rows if row[2].department_id}
    depts = {}
    if dept_ids:
        dept_records = db.scalars(select(Department).where(Department.id.in_(dept_ids))).all()
        depts = {d.id: d.name for d in dept_records}

    logs = []
    currently_out_count = 0
    today_exits_count = 0
    today_returns_count = 0
    overdue_count = 0

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    for exit_log, gate_pass, profile, student_user in all_rows:
        is_returned = exit_log.return_at is not None
        is_overdue = False

        if is_returned:
            if gate_pass.qr_expires_at and exit_log.return_at > gate_pass.qr_expires_at:
                is_overdue = True
        else:
            if gate_pass.qr_expires_at and now > gate_pass.qr_expires_at:
                is_overdue = True

        if not is_returned:
            currently_out_count += 1
        if exit_log.exit_at and exit_log.exit_at >= today_start:
            today_exits_count += 1
        if exit_log.return_at and exit_log.return_at >= today_start:
            today_returns_count += 1
        if is_overdue:
            overdue_count += 1

        # Calculate duration in minutes
        if is_returned and exit_log.exit_at and exit_log.return_at:
            duration_minutes = max(0, int((exit_log.return_at - exit_log.exit_at).total_seconds() / 60))
        elif not is_returned and exit_log.exit_at:
            duration_minutes = max(0, int((now - exit_log.exit_at).total_seconds() / 60))
        else:
            duration_minutes = None

        log_item = {
            "id": exit_log.id,
            "gate_pass_id": gate_pass.id,
            "pass_code": gate_pass.gate_pass_id,
            "student_name": student_user.full_name,
            "student_id": profile.student_id or "",
            "student_email": student_user.email,
            "department_name": depts.get(profile.department_id, "General"),
            "reason": gate_pass.reason,
            "exit_at": to_iso_utc(exit_log.exit_at),
            "return_at": to_iso_utc(exit_log.return_at) if exit_log.return_at else None,
            "is_returned": is_returned,
            "is_overdue": is_overdue,
            "sync_status": exit_log.sync_status,
            "security_officer_name": officers.get(exit_log.security_user_id, "Campus Security"),
            "scheduled_exit_at": to_iso_utc(gate_pass.exit_at),
            "scheduled_return_at": to_iso_utc(gate_pass.return_at),
            "qr_expires_at": to_iso_utc(gate_pass.qr_expires_at) if gate_pass.qr_expires_at else None,
            "duration_minutes": duration_minutes,
            "pass_status": gate_pass.status.value,
        }

        # Apply filtering
        if movement_filter == "CURRENTLY_OUT" and is_returned:
            continue
        elif movement_filter == "EXIT" and is_returned:
            continue
        elif movement_filter == "RETURN" and not is_returned:
            continue

        if search:
            s_clean = search.lower().strip()
            text_corpus = f"{log_item['student_name']} {log_item['student_id']} {log_item['pass_code']} {log_item['reason']}".lower()
            if s_clean not in text_corpus:
                continue

        logs.append(log_item)

    return {
        "logs": logs[:limit],
        "total_count": len(logs),
        "metrics": {
            "currently_outside": currently_out_count,
            "today_exits": today_exits_count,
            "today_returns": today_returns_count,
            "overdue_count": overdue_count,
            "total_all_time": len(all_rows),
        },
    }


@router.get("/mailbox/latest")
def get_latest_email(email: str | None = None, db: Session = Depends(get_db)):
    query = select(SentEmail)
    if email:
        query = query.where(SentEmail.recipient == email.lower().strip())
    query = query.order_by(SentEmail.id.desc())
    msg = db.scalar(query)
    if not msg:
        return {"found": False, "message": "No emails in mailbox"}
    return {
        "found": True,
        "id": msg.id,
        "recipient": msg.recipient,
        "sender": msg.sender,
        "subject": msg.subject,
        "body_html": msg.body_html,
        "body_plain": msg.body_plain,
        "otp_code": msg.otp_code,
        "delivery_status": msg.delivery_status,
        "created_at": to_iso_utc(msg.created_at),
    }


@router.get("/mailbox/messages")
def get_mailbox_messages(email: str | None = None, db: Session = Depends(get_db)):
    query = select(SentEmail)
    if email:
        query = query.where(SentEmail.recipient == email.lower().strip())
    query = query.order_by(SentEmail.id.desc()).limit(20)
    msgs = db.scalars(query).all()
    return [
        {
            "id": m.id,
            "recipient": m.recipient,
            "sender": m.sender,
            "subject": m.subject,
            "body_html": m.body_html,
            "otp_code": m.otp_code,
            "delivery_status": m.delivery_status,
            "created_at": to_iso_utc(m.created_at),
        }
        for m in msgs
    ]


@router.get("/staff")
def list_staff(
    status_filter: StaffStatus | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require(Role.PRINCIPAL, Role.ADMIN)),
):
    query = (
        select(User, StaffProfile, Department)
        .outerjoin(StaffProfile, StaffProfile.user_id == User.id)
        .outerjoin(Department, Department.id == StaffProfile.department_id)
        .where(User.role.notin_([Role.STUDENT, Role.ADMIN]))
    )
    if status_filter:
        query = query.where(User.staff_status == status_filter)
    query = query.order_by(User.id.desc())

    results = []
    for user_obj, profile, dept in db.execute(query).all():
        yr = db.get(AcademicYear, profile.year_id) if profile and profile.year_id else None
        sec = db.get(Section, profile.section_id) if profile and profile.section_id else None
        results.append({
            "id": user_obj.id,
            "full_name": user_obj.full_name,
            "email": user_obj.email,
            "role": user_obj.role.value,
            "staff_status": user_obj.staff_status.value,
            "email_verified": user_obj.email_verified,
            "created_at": to_iso_utc(user_obj.created_at),
            "employee_id": profile.employee_id if profile else None,
            "phone": profile.phone if profile else None,
            "designation": profile.designation if profile else None,
            "department": dept.name if dept else None,
            "department_id": profile.department_id if profile else None,
            "year": yr.name if yr else None,
            "year_id": profile.year_id if profile else None,
            "section": sec.name if sec else None,
            "section_id": profile.section_id if profile else None,
        })
    return results


@router.post("/staff/{user_id}/decision")
def staff_decision(
    user_id: int,
    body: Decision,
    db: Session = Depends(get_db),
    admin: User = Depends(require(Role.PRINCIPAL, Role.ADMIN)),
):
    user_obj = db.get(User, user_id)
    if not user_obj:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff member not found")
    if user_obj.role in {Role.STUDENT, Role.ADMIN, Role.PRINCIPAL}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot update status for this role")

    if body.decision == "APPROVE":
        user_obj.staff_status = StaffStatus.APPROVED
    elif body.decision == "REJECT":
        user_obj.staff_status = StaffStatus.REJECTED
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid decision")

    db.commit()
    db.refresh(user_obj)
    return {
        "message": f"Staff account has been {user_obj.staff_status.value.lower()}",
        "user_id": user_obj.id,
        "staff_status": user_obj.staff_status.value,
    }


# ─────────────────────────────────────────────────────────────────────────────
# COLLEGE ONBOARDING — College Inquiry & Admin Management
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/college-requests")
def submit_college_request(body: CollegeInquiry, db: Session = Depends(get_db)):
    """Public endpoint — any college can submit an onboarding inquiry."""
    existing = db.scalar(
        select(CollegeRequest).where(
            CollegeRequest.contact_email == body.contact_email.lower().strip(),
            CollegeRequest.status == CollegeRequestStatus.PENDING,
        )
    )
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "A pending request from this email already exists. Our admin will review it shortly.",
        )

    req = CollegeRequest(
        college_name=body.college_name.strip(),
        contact_name=body.contact_name.strip(),
        contact_email=body.contact_email.lower().strip(),
        contact_phone=(body.contact_phone or "").strip() or None,
        city=(body.city or "").strip() or None,
        message=(body.message or "").strip() or None,
        status=CollegeRequestStatus.PENDING,
        created_at=utc_now(),
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    # Send acknowledgement email to the contact
    _send_college_inquiry_ack(body, get_settings())

    return {
        "message": "Your request has been received. Our admin team will review it and get back to you within 24 hours.",
        "request_id": req.id,
    }


def _send_college_inquiry_ack(body: CollegeInquiry, settings):
    """Send an acknowledgement email to the college contact after inquiry submission."""
    import smtplib, ssl
    from email.message import EmailMessage
    from ..database import SessionLocal
    from ..models import SentEmail as SE

    sender_address = settings.smtp_from_email or "no-reply@abhigam.in"
    subject = f"We received your request - {body.college_name}"
    plain = (
        f"Dear {body.contact_name},\n\n"
        f"Thank you for your interest in Anumathi.\n"
        f"We have received your inquiry for {body.college_name} and our admin team will review it "
        f"and reach out to you at {body.contact_email} within 24 hours.\n\n"
        f"- Anumathi / Abhigam Support Team"
    )
    html = f"""<!DOCTYPE html><html><head><meta charset='utf-8'>
<style>
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:24px;color:#1e293b}}
  .c{{max-width:520px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden}}
  .hd{{background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;padding:24px;text-align:center}}
  .hd h1{{margin:0;font-size:20px;font-weight:700}}
  .bd{{padding:28px 24px}}
  .badge{{display:inline-block;background:#eff6ff;color:#3b82f6;border:1px solid #bfdbfe;border-radius:20px;padding:4px 14px;font-size:13px;font-weight:600;margin-bottom:16px}}
  .ft{{background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px;text-align:center;font-size:12px;color:#94a3b8}}
</style></head><body>
<div class='c'>
  <div class='hd'><h1>Anumathi - Request Received</h1></div>
  <div class='bd'>
    <div class='badge'>Inquiry Submitted</div>
    <p>Dear <strong>{body.contact_name}</strong>,</p>
    <p>Thank you for reaching out! We have received your onboarding request for <strong>{body.college_name}</strong>.</p>
    <p>Our admin team will review your request and contact you at <strong>{body.contact_email}</strong> within <strong>24 hours</strong> with your login credentials.</p>
    <p style='color:#64748b;font-size:13px;margin-top:20px'>If you have any questions, reply to this email or contact us directly.</p>
  </div>
  <div class='ft'>Anumathi - Intelligent Campus Gate Pass System - Powered by Abhigam</div>
</div></body></html>"""

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender_address
    msg["To"] = body.contact_email
    msg.set_content(plain)
    msg.add_alternative(html, subtype="html")

    try:
        with SessionLocal() as db_s:
            db_s.add(SE(
                recipient=body.contact_email.lower(),
                sender=sender_address,
                subject=subject,
                body_html=html,
                body_plain=plain,
                delivery_status="virtual",
            ))
            db_s.commit()
    except Exception:
        pass

    if settings.smtp_host and settings.smtp_from_email:
        try:
            if settings.smtp_port == 465:
                ctx = ssl.create_default_context()
                with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=ctx, timeout=5) as srv:
                    if settings.smtp_username:
                        srv.login(settings.smtp_username, settings.smtp_password)
                    srv.send_message(msg)
            else:
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=5) as srv:
                    if settings.smtp_use_tls:
                        srv.starttls(context=ssl.create_default_context())
                    if settings.smtp_username:
                        srv.login(settings.smtp_username, settings.smtp_password)
                    srv.send_message(msg)
        except Exception as e:
            import logging; logging.getLogger(__name__).warning("College inquiry ACK email failed: %s", e)


@router.get("/admin/college-requests")
def list_college_requests(
    req_status: str | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require(Role.ADMIN)),
):
    """ADMIN ONLY — List all college onboarding requests."""
    query = select(CollegeRequest).order_by(CollegeRequest.id.desc())
    if req_status:
        try:
            st = CollegeRequestStatus(req_status.upper())
            query = query.where(CollegeRequest.status == st)
        except ValueError:
            pass
    rows = db.scalars(query).all()
    return [
        {
            "id": r.id,
            "college_name": r.college_name,
            "contact_name": r.contact_name,
            "contact_email": r.contact_email,
            "contact_phone": r.contact_phone,
            "city": r.city,
            "message": r.message,
            "status": r.status.value,
            "admin_notes": r.admin_notes,
            "assigned_college_id": r.assigned_college_id,
            "assigned_admin_user_id": r.assigned_admin_user_id,
            "created_at": to_iso_utc(r.created_at),
            "reviewed_at": to_iso_utc(r.reviewed_at),
        }
        for r in rows
    ]


@router.post("/admin/college-requests/{request_id}/decision")
def decide_college_request(
    request_id: int,
    body: CollegeRequestDecision,
    db: Session = Depends(get_db),
    admin: User = Depends(require(Role.ADMIN)),
):
    """ADMIN ONLY — Approve or reject a college onboarding request.

    On APPROVE:
    - Creates a College record
    - Creates an ADMIN User for the college
    - Optionally registers the allowed email domain
    - Sends login credentials to the college contact via email
    """
    req = db.get(CollegeRequest, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "College request not found")
    if req.status != CollegeRequestStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Request is already {req.status.value.lower()}")

    now = utc_now()

    if body.decision == "REJECT":
        req.status = CollegeRequestStatus.REJECTED
        req.admin_notes = body.admin_notes
        req.reviewed_at = now
        db.commit()
        _send_college_decision_email(
            contact_email=req.contact_email,
            contact_name=req.contact_name,
            college_name=req.college_name,
            approved=False,
            admin_notes=body.admin_notes,
            settings=get_settings(),
        )
        return {"message": "College request rejected.", "status": "REJECTED"}

    # --- APPROVE ---
    if not body.admin_password:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "admin_password is required when approving a college request",
        )

    # 1. Create the College
    college = College(name=req.college_name, active=True)
    db.add(college)
    db.flush()

    # 2. Register allowed email domain (optional)
    if body.allowed_email_domain:
        domain = body.allowed_email_domain.strip().lower()
        existing_domain = db.scalar(
            select(EmailDomain).where(
                EmailDomain.college_id == college.id,
                EmailDomain.domain == domain,
            )
        )
        if not existing_domain:
            db.add(EmailDomain(college_id=college.id, domain=domain, is_active=True, created_at=now))

    # 3. Create Admin user for this college
    existing_user = db.scalar(select(User).where(User.email == req.contact_email.lower()))
    if existing_user:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"A user with email {req.contact_email} already exists.",
        )

    college_admin = User(
        college_id=college.id,
        email=req.contact_email.lower(),
        full_name=req.contact_name,
        password_hash=hash_password(body.admin_password),
        role=Role.ADMIN,
        email_verified=True,
        staff_status=StaffStatus.APPROVED,
        active=True,
        created_at=now,
    )
    db.add(college_admin)
    db.flush()

    # 4. Update request
    req.status = CollegeRequestStatus.APPROVED
    req.assigned_college_id = college.id
    req.assigned_admin_user_id = college_admin.id
    req.admin_notes = body.admin_notes
    req.reviewed_at = now
    db.commit()

    # 5. Send credentials email
    _send_college_decision_email(
        contact_email=req.contact_email,
        contact_name=req.contact_name,
        college_name=req.college_name,
        approved=True,
        temp_password=body.admin_password,
        login_url=get_settings().frontend_url,
        admin_notes=body.admin_notes,
        settings=get_settings(),
    )

    return {
        "message": f"College '{req.college_name}' approved. Admin account created for {req.contact_email}.",
        "status": "APPROVED",
        "college_id": college.id,
        "admin_user_id": college_admin.id,
    }


def _send_college_decision_email(
    *,
    contact_email: str,
    contact_name: str,
    college_name: str,
    approved: bool,
    temp_password: str = "",
    login_url: str = "",
    admin_notes: str | None = None,
    settings,
):
    """Send approval/rejection email to the college contact."""
    import smtplib, ssl
    from email.message import EmailMessage
    from ..database import SessionLocal
    from ..models import SentEmail as SE

    sender_address = settings.smtp_from_email or "no-reply@abhigam.in"

    if approved:
        subject = f"Your college has been approved - {college_name}"
        plain = (
            f"Dear {contact_name},\n\n"
            f"Congratulations! Your request for {college_name} has been approved.\n"
            f"Your admin login credentials are:\n"
            f"  Email   : {contact_email}\n"
            f"  Password: {temp_password}\n"
            f"  Login URL: {login_url}\n\n"
            f"Please log in and change your password immediately.\n"
            f"{'Note: ' + admin_notes if admin_notes else ''}\n\n"
            f"- Anumathi / Abhigam Support Team"
        )
        html = f"""<!DOCTYPE html><html><head><meta charset='utf-8'>
<style>
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:24px;color:#1e293b}}
  .c{{max-width:540px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden}}
  .hd{{background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:24px;text-align:center}}
  .hd h1{{margin:0;font-size:20px;font-weight:700}}
  .bd{{padding:28px 24px}}
  .cred-box{{background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:18px 20px;margin:20px 0}}
  .cred-row{{display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px}}
  .cred-label{{color:#64748b;font-weight:600}}
  .cred-value{{font-family:monospace;color:#1e293b;font-weight:700}}
  .btn-a{{display:inline-block;margin-top:16px;background:#4f46e5;color:#fff!important;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px}}
  .warn{{color:#92400e;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:10px 14px;font-size:13px;margin-top:12px}}
  .ft{{background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px;text-align:center;font-size:12px;color:#94a3b8}}
</style></head><body>
<div class='c'>
  <div class='hd'><h1>College Approved!</h1></div>
  <div class='bd'>
    <p>Dear <strong>{contact_name}</strong>,</p>
    <p>Your college <strong>{college_name}</strong> has been successfully onboarded to <strong>Anumathi</strong>.</p>
    <p>Here are your administrator login credentials:</p>
    <div class='cred-box'>
      <div class='cred-row'><span class='cred-label'>Email</span><span class='cred-value'>{contact_email}</span></div>
      <div class='cred-row'><span class='cred-label'>Temporary Password</span><span class='cred-value'>{temp_password}</span></div>
    </div>
    <div class='warn'>Please log in and change your password immediately for security.</div>
    {f"<p style='color:#475569;font-size:13px;margin-top:14px'><strong>Note:</strong> {admin_notes}</p>" if admin_notes else ''}
    <p><a href='{login_url}' class='btn-a'>Log In to Anumathi</a></p>
  </div>
  <div class='ft'>Anumathi - Intelligent Campus Gate Pass System - Powered by Abhigam</div>
</div></body></html>"""
    else:
        subject = f"Update on your college request - {college_name}"
        plain = (
            f"Dear {contact_name},\n\n"
            f"We regret to inform you that your request for {college_name} could not be approved at this time.\n"
            f"{'Reason: ' + admin_notes if admin_notes else ''}\n\n"
            f"Please contact our support team for further assistance.\n"
            f"- Anumathi / Abhigam Support Team"
        )
        html = f"""<!DOCTYPE html><html><head><meta charset='utf-8'>
<style>
  body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:24px}}
  .c{{max-width:520px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden}}
  .hd{{background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;padding:24px;text-align:center}}
  .hd h1{{margin:0;font-size:20px;font-weight:700}}
  .bd{{padding:28px 24px;color:#1e293b}}
  .ft{{background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px;text-align:center;font-size:12px;color:#94a3b8}}
</style></head><body>
<div class='c'>
  <div class='hd'><h1>Request Update</h1></div>
  <div class='bd'>
    <p>Dear <strong>{contact_name}</strong>,</p>
    <p>We regret to inform you that the onboarding request for <strong>{college_name}</strong> could not be approved at this time.</p>
    {f"<p><strong>Reason:</strong> {admin_notes}</p>" if admin_notes else ''}
    <p>Please contact our support team if you believe this is a mistake or would like to re-apply.</p>
  </div>
  <div class='ft'>Anumathi - Intelligent Campus Gate Pass System - Powered by Abhigam</div>
</div></body></html>"""

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender_address
    msg["To"] = contact_email
    msg.set_content(plain)
    msg.add_alternative(html, subtype="html")

    try:
        with SessionLocal() as db_s:
            db_s.add(SE(
                recipient=contact_email.lower(),
                sender=sender_address,
                subject=subject,
                body_html=html,
                body_plain=plain,
                delivery_status="virtual",
            ))
            db_s.commit()
    except Exception:
        pass

    if settings.smtp_host and settings.smtp_from_email:
        try:
            if settings.smtp_port == 465:
                ctx = ssl.create_default_context()
                with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=ctx, timeout=5) as srv:
                    if settings.smtp_username:
                        srv.login(settings.smtp_username, settings.smtp_password)
                    srv.send_message(msg)
            else:
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=5) as srv:
                    if settings.smtp_use_tls:
                        srv.starttls(context=ssl.create_default_context())
                    if settings.smtp_username:
                        srv.login(settings.smtp_username, settings.smtp_password)
                    srv.send_message(msg)
        except Exception as e:
            import logging; logging.getLogger(__name__).warning("College decision email failed: %s", e)
