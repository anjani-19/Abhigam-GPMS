import re
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from .models import Role
class Register(BaseModel):
    full_name:str=Field(min_length=2,max_length=150); email:EmailStr; password:str=Field(min_length=6,max_length=128); college_id:int=1; student_id:str|None=None; employee_id:str|None=None; phone:str=Field(min_length=7,max_length=25); role:Role=Role.STUDENT; department_id:int|None=None
    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters long")
        if not re.search(r'[a-z]', v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r'[A-Z]', v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r'\d', v):
            raise ValueError("Password must contain at least one digit")
        if not re.search(r'[\W_]', v):
            raise ValueError("Password must contain at least one special character")
        return v
    @model_validator(mode="after")
    def valid_registration(self):
        if self.role==Role.PRINCIPAL: raise ValueError("Principal cannot self-register")
        if self.role==Role.STUDENT and not self.student_id: raise ValueError("student_id is required")
        if self.role not in (Role.STUDENT,Role.ADMIN) and not self.employee_id: raise ValueError("employee_id is required")
        return self
class OTPVerify(BaseModel): email:EmailStr; code:str=Field(pattern=r"^\d{6}$"); purpose:str="registration"
class EmailOnly(BaseModel): email:EmailStr
class ResendOTPRequest(BaseModel): email:EmailStr; purpose:str|None=None
class Login(BaseModel): email:EmailStr; password:str
class TokenVerify(BaseModel): email:EmailStr; code:str=Field(pattern=r"^\d{6}$")
class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$")
    new_password: str = Field(min_length=6, max_length=64)

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters long")
        if not re.search(r'[a-z]', v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r'[A-Z]', v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r'\d', v):
            raise ValueError("Password must contain at least one digit")
        if not re.search(r'[\W_]', v):
            raise ValueError("Password must contain at least one special character")
        return v

class ResetPasswordWithTokenRequest(BaseModel):
    email: EmailStr
    token: str = Field(min_length=1)
    new_password: str = Field(min_length=6, max_length=64)

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters long")
        if not re.search(r'[a-z]', v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r'[A-Z]', v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r'\d', v):
            raise ValueError("Password must contain at least one digit")
        if not re.search(r'[\W_]', v):
            raise ValueError("Password must contain at least one special character")
        return v

class ProfileUpdate(BaseModel): phone:str|None=None; gender:str|None=None; department_id:int|None=None; year_id:int|None=None; semester_id:int|None=None; section_id:int|None=None; cgpa:str|None=None; arrears:int|None=None; guardian_name:str|None=None; guardian_relationship:str|None=None; guardian_phone:str|None=None; accommodation:str|None=None; hostel_block_id:int|None=None; room_number:str|None=None
class PassCreate(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)
    exit_at: datetime
    return_at: datetime
    is_emergency: bool = False
    emergency_reason: str | None = None
    @model_validator(mode="after")
    def valid_dates(self):
        if self.return_at <= self.exit_at:
            raise ValueError("Return must be after exit")
        return self
class Decision(BaseModel): decision:str=Field(pattern="^(APPROVE|REJECT)$"); remarks:str|None=None
class Scan(BaseModel): token:str=Field(min_length=1)
class PassExtend(BaseModel):
    extension_minutes: int = Field(ge=5, le=1440, default=30)
    reason: str = Field(min_length=3, max_length=500)
class ExtensionDecision(BaseModel):
    decision: str = Field(pattern="^(APPROVE|REJECT)$")
    remarks: str | None = None

class StaffProfileUpdate(BaseModel):
    phone: str | None = None
    department_id: int | None = None
    year_id: int | None = None
    section_id: int | None = None
    designation: str | None = None
class PhoneOTPSend(BaseModel):
    phone: str = Field(min_length=7, max_length=15)
    purpose: str  # 'student_phone' | 'guardian_phone'
class PhoneOTPVerify(BaseModel):
    phone: str = Field(min_length=7, max_length=15)
    code: str = Field(pattern=r"^\d{6}$")
    purpose: str  # 'student_phone' | 'guardian_phone'


class CollegeInquiry(BaseModel):
    """Public form for colleges to request access to the system."""
    college_name: str = Field(min_length=3, max_length=200)
    contact_name: str = Field(min_length=2, max_length=150)
    contact_email: str = Field(min_length=5, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=25)
    city: str | None = Field(default=None, max_length=100)
    message: str | None = Field(default=None, max_length=2000)


class CollegeRequestDecision(BaseModel):
    """Admin decision on a college onboarding request."""
    decision: str = Field(pattern="^(APPROVE|REJECT)$")
    # Required when approving: the temporary password for the college admin account
    admin_password: str | None = None
    allowed_email_domain: str | None = None  # e.g. "abc.edu.in" added to email_domains
    admin_notes: str | None = None
