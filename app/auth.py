import os
import hashlib  # เพิ่มตัวนี้
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
import redis.asyncio as redis_client

# --- Configuration (ดึงจาก .env) ---
PEPPER = os.getenv("SECRET_PEPPER", "DEFAULT_PEPPER_FOR_DEV")
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "DEFAULT_SECRET_KEY_FOR_DEV")
ALGORITHM = os.getenv("ALGORITHM", "HS256")

# ดึงค่ามาเป็น int และตั้ง default เป็น 30 นาที
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ฟังก์ชันช่วยจัดการความยาวก่อน Hash
def _get_peppered_password(password: str) -> str:
    # นำ Password มารวมกับ Pepper แล้วต้มให้เหลือ 64 ตัวอักษร (SHA256)
    # วิธีนี้จะทำให้ไม่ว่า Pepper จะยาวแค่ไหน bcrypt จะได้รับแค่ 64 bytes เสมอ
    pepper_bytes = PEPPER.encode('utf-8')
    pass_bytes = password.encode('utf-8')
    
    # ใช้ hashlib สร้าง hex string ยาว 64 ตัว
    return hashlib.sha256(pass_bytes + pepper_bytes).hexdigest()

# --- Password Hashing (Salt & Pepper) ---
def get_password_hash(password: str) -> str:
    # bcrypt จะได้รับ string 64 ตัว ซึ่งไม่เกิน 72 แน่นอน
    return pwd_context.hash(_get_peppered_password(password))

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(_get_peppered_password(plain_password), hashed_password)

# --- JWT Token Management ---
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        # ใช้ค่าเริ่มต้นจาก ACCESS_TOKEN_EXPIRE_MINUTES ที่เราตั้งไว้ 1 วัน
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# --- Redis Session Control (Strength Enhancement) ---
async def store_token_in_redis(redis: redis_client.Redis, user_id: int, role: str, token: str):
    """บันทึก Token ลง Redis เพื่อควบคุม Session"""
    key = f"active_token:{role}:{user_id}"
    # บันทึก Token และตั้งเวลาตาย 30 นาที
    await redis.set(key, token, ex=ACCESS_TOKEN_EXPIRE_MINUTES * 60)


async def is_token_active(redis: redis_client.Redis, user_id: int, role: str, current_token: str):
    key = f"active_token:{role}:{user_id}"
    stored_token = await redis.get(key)
    if stored_token is None:
        return False
    
    # --- จุดสำคัญ: เลื่อนเวลาตายออกไป (Sliding Expiration) ---
    # ถ้าผู้ใช้ยังมีการเรียกใช้ API อยู่ เราจะต่อเวลาใน Redis ให้อีก 30 นาทีอัตโนมัติ
    if stored_token.decode('utf-8') == current_token:
        await redis.expire(key, ACCESS_TOKEN_EXPIRE_MINUTES * 60)
        return True
    return False