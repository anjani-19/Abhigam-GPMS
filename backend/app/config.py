from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    expose_otp_in_local_response: bool = False
    database_url: str = "sqlite:///./smart_gate_pass.db"
    jwt_secret_key: str = "development-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    otp_expire_minutes: int = 10
    otp_max_attempts: int = 5
    allowed_email_domains: str = "jnn.edu.in"
    cors_origins: str = "http://localhost:5173"
    frontend_url: str = "http://localhost:5173"
    api_public_url: str = "http://localhost:8000/api"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_use_tls: bool = True
    # SMS (Fast2SMS) settings
    fast2sms_api_key: str | None = None
    fast2sms_sender_id: str = "JNNINS"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def domains(self): return {x.strip().lower() for x in self.allowed_email_domains.split(",") if x.strip()}
    @property
    def origins(self): return [x.strip() for x in self.cors_origins.split(",") if x.strip()]

@lru_cache
def get_settings(): return Settings()
