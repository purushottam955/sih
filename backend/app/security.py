from datetime import datetime, timedelta, timezone
from jose import jwt
import bcrypt
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SECRET_KEY: str = "super-secret-hackathon-key-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    GEMINI_API_KEY: str = ""
    
    class Config:
        env_file = ".env"

settings = Settings()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not plain_password or not hashed_password:
        return False
    try:
        p_bytes = str(plain_password).encode("utf-8")[:72]
        h_bytes = str(hashed_password).encode("utf-8")
        return bcrypt.checkpw(p_bytes, h_bytes)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    p_bytes = str(password).encode("utf-8")[:72]
    return bcrypt.hashpw(p_bytes, bcrypt.gensalt()).decode("utf-8")

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)