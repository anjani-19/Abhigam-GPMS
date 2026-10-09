from datetime import datetime
from enum import Enum
from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


class Role(str, Enum):
    ADMIN = "ADMIN"
    STUDENT = "STUDENT"
    CLASS_INCHARGE = "CLASS_INCHARGE"
    HOD = "HOD"
    PRINCIPAL = "PRINCIPAL"
    WARDEN = "WARDEN"
    SECURITY = "SECURITY"


class StaffStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    SUSPENDED = "SUSPENDED"


class PassStatus(str, Enum):
    PENDING_CLASS_INCHARGE = "PENDING_CLASS_INCHARGE"
    PENDING_HOD = "PENDING_HOD"
    PENDING_PRINCIPAL = "PENDING_PRINCIPAL"
    PENDING_WARDEN = "PENDING_WARDEN"
    QR_GENERATED = "QR_GENERATED"
    REJECTED = "REJECTED"
    EXITED = "EXITED"
    RETURNED = "RETURNED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class College(Base):
    __tablename__ = "colleges"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class EmailDomain(Base):
    __tablename__ = "email_domains"
    __table_args__ = (UniqueConstraint("college_id", "domain"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    college_id: Mapped[int] = mapped_column(ForeignKey("colleges.id"))
    domain: Mapped[str] = mapped_column(String(150))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(primary_key=True)
    college_id: Mapped[int] = mapped_column(ForeignKey("colleges.id"))
    name: Mapped[str] = mapped_column(String(120))
    hod_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class AcademicYear(Base):
    __tablename__ = "academic_years"
    id: Mapped[int] = mapped_column(primary_key=True)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    name: Mapped[str] = mapped_column(String(30))


class Semester(Base):
    __tablename__ = "semesters"
    id: Mapped[int] = mapped_column(primary_key=True)
    year_id: Mapped[int] = mapped_column(ForeignKey("academic_years.id"))
    name: Mapped[str] = mapped_column(String(30))


class Section(Base):
    __tablename__ = "sections"
    id: Mapped[int] = mapped_column(primary_key=True)
    semester_id: Mapped[int] = mapped_column(ForeignKey("semesters.id"))
    name: Mapped[str] = mapped_column(String(30))
    class_incharge_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class Hostel(Base):
    __tablename__ = "hostels"
    id: Mapped[int] = mapped_column(primary_key=True)
    college_id: Mapped[int] = mapped_column(ForeignKey("colleges.id"))
    name: Mapped[str] = mapped_column(String(100))


class HostelBlock(Base):
    __tablename__ = "hostel_blocks"
    id: Mapped[int] = mapped_column(primary_key=True)
    hostel_id: Mapped[int] = mapped_column(ForeignKey("hostels.id"))
    name: Mapped[str] = mapped_column(String(80))
    code: Mapped[str] = mapped_column(String(30), unique=True)
    capacity: Mapped[int] = mapped_column(Integer, default=0)
    warden_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    gender: Mapped[str | None] = mapped_column(String(10), nullable=True)  # 'MALE' | 'FEMALE' | None


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    college_id: Mapped[int] = mapped_column(ForeignKey("colleges.id"))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(150))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(SAEnum(Role))
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    staff_status: Mapped[StaffStatus] = mapped_column(SAEnum(StaffStatus), default=StaffStatus.APPROVED)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class StudentProfile(Base):
    __tablename__ = "student_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    student_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(25))
    gender: Mapped[str | None] = mapped_column(String(10), nullable=True)  # 'MALE' | 'FEMALE'
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))
    year_id: Mapped[int | None] = mapped_column(ForeignKey("academic_years.id"))
    semester_id: Mapped[int | None] = mapped_column(ForeignKey("semesters.id"))
    section_id: Mapped[int | None] = mapped_column(ForeignKey("sections.id"))
    cgpa: Mapped[str | None] = mapped_column(String(15))
    arrears: Mapped[int | None] = mapped_column(Integer)
    guardian_name: Mapped[str | None] = mapped_column(String(150))
    guardian_relationship: Mapped[str | None] = mapped_column(String(50))
    guardian_phone: Mapped[str | None] = mapped_column(String(25))
    accommodation: Mapped[str | None] = mapped_column(String(20))
    hostel_block_id: Mapped[int | None] = mapped_column(ForeignKey("hostel_blocks.id"))
    room_number: Mapped[str | None] = mapped_column(String(20))


class StaffProfile(Base):
    __tablename__ = "staff_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    employee_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(25))
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))
    year_id: Mapped[int | None] = mapped_column(ForeignKey("academic_years.id"), nullable=True)
    section_id: Mapped[int | None] = mapped_column(ForeignKey("sections.id"), nullable=True)
    designation: Mapped[str] = mapped_column(String(60))


class OTP(Base):
    __tablename__ = "otps"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    purpose: Mapped[str] = mapped_column(String(80))
    code_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0)


class GatePass(Base):
    __tablename__ = "gate_passes"
    id: Mapped[int] = mapped_column(primary_key=True)
    gate_pass_id: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"))
    reason: Mapped[str] = mapped_column(Text)
    guardian_name: Mapped[str] = mapped_column(String(150))
    guardian_phone: Mapped[str] = mapped_column(String(25))
    exit_at: Mapped[datetime] = mapped_column(DateTime)
    return_at: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[PassStatus] = mapped_column(SAEnum(PassStatus), default=PassStatus.PENDING_CLASS_INCHARGE, index=True)
    is_emergency: Mapped[bool] = mapped_column(Boolean, default=False)
    emergency_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    qr_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    qr_token_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    qr_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[int] = mapped_column(primary_key=True)
    gate_pass_id: Mapped[int] = mapped_column(ForeignKey("gate_passes.id"))
    approver_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    role: Mapped[Role] = mapped_column(SAEnum(Role))
    decision: Mapped[str] = mapped_column(String(20))
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ExitLog(Base):
    __tablename__ = "exit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    gate_pass_id: Mapped[int] = mapped_column(ForeignKey("gate_passes.id"), index=True)
    security_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    exit_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    return_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sync_status: Mapped[str] = mapped_column(String(20), default="PENDING")


class SentEmail(Base):
    __tablename__ = "sent_emails"
    id: Mapped[int] = mapped_column(primary_key=True)
    recipient: Mapped[str] = mapped_column(String(255), index=True)
    sender: Mapped[str] = mapped_column(String(255))
    subject: Mapped[str] = mapped_column(String(255))
    body_html: Mapped[str] = mapped_column(Text)
    body_plain: Mapped[str] = mapped_column(Text)
    otp_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    delivery_status: Mapped[str] = mapped_column(String(30), default="virtual")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ExtensionLog(Base):
    __tablename__ = "extension_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    gate_pass_id: Mapped[int] = mapped_column(ForeignKey("gate_passes.id"), index=True)
    extended_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    extension_minutes: Mapped[int] = mapped_column(Integer)
    previous_return_at: Mapped[datetime] = mapped_column(DateTime)
    new_return_at: Mapped[datetime] = mapped_column(DateTime)
    previous_qr_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    new_qr_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reason: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ExtensionRequest(Base):
    __tablename__ = "extension_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    gate_pass_id: Mapped[int] = mapped_column(ForeignKey("gate_passes.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    extension_minutes: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", index=True)  # PENDING, APPROVED, REJECTED, CANCELLED
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    review_remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class CollegeRequestStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class CollegeRequest(Base):
    """Tracks onboarding inquiries from colleges that want to use the system."""
    __tablename__ = "college_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    college_name: Mapped[str] = mapped_column(String(200))
    contact_name: Mapped[str] = mapped_column(String(150))
    contact_email: Mapped[str] = mapped_column(String(255), index=True)
    contact_phone: Mapped[str | None] = mapped_column(String(25), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[CollegeRequestStatus] = mapped_column(
        SAEnum(CollegeRequestStatus), default=CollegeRequestStatus.PENDING, index=True
    )
    # Set when approved
    assigned_college_id: Mapped[int | None] = mapped_column(ForeignKey("colleges.id"), nullable=True)
    assigned_admin_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
