from datetime import datetime, timedelta, timezone
import hashlib, secrets, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from .config import get_settings
from .database import get_db
from .models import Role, User, StaffStatus
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto"); bearer=HTTPBearer()
def hash_password(value): return pwd.hash(value)
def verify_password(value, hashed): return pwd.verify(value,hashed)
def hash_token(value): return hashlib.sha256(value.encode()).hexdigest()
def token(): return secrets.token_urlsafe(32)
def jwt_for(user):
    s=get_settings(); return jwt.encode({"sub":str(user.id),"role":user.role.value,"exp":datetime.now(timezone.utc)+timedelta(minutes=s.access_token_expire_minutes)},s.jwt_secret_key,algorithm=s.jwt_algorithm)
def current_user(credentials:HTTPAuthorizationCredentials=Depends(bearer), db:Session=Depends(get_db)):
    try: data=jwt.decode(credentials.credentials,get_settings().jwt_secret_key,algorithms=[get_settings().jwt_algorithm]); user=db.get(User,int(data["sub"]))
    except Exception: raise HTTPException(401,"Invalid or expired token")
    if not user or not user.active: raise HTTPException(401,"Inactive account")
    return user
def require(*roles):
    def check(user:User=Depends(current_user)):
        if user.role not in roles: raise HTTPException(status.HTTP_403_FORBIDDEN,"Insufficient permissions")
        if user.role not in {Role.ADMIN,Role.STUDENT,Role.PRINCIPAL} and user.staff_status!=StaffStatus.APPROVED: raise HTTPException(403,"Staff account is not approved")
        return user
    return check
