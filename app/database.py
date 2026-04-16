import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

# ดึงค่าจาก .env
DATABASE_URL = os.getenv("DATABASE_URL")

# สร้าง Engine สำหรับ Async พร้อมจัดการ Connection Pool
engine = create_async_engine(
    DATABASE_URL, 
    echo=False,                # ✅ ใน Production ปรับเป็น False เพื่อลดการ Log ที่ไม่จำเป็น (ช่วยให้เร็วขึ้น)
    pool_size=20,              # ✅ เพิ่มจำนวนท่อหลักเป็น 20 ท่อ
    max_overflow=10,           # ✅ ถ้าท่อเต็ม ยอมให้ขยายชั่วคราวได้อีก 10 ท่อ (รวมเป็น 30)
    pool_timeout=30,           # ✅ ถ้ารอนานเกิน 30 วินาทีให้ตัด (ป้องกันคิวค้างยาว)
    pool_recycle=1800,         # ✅ รีไซเคิลสายทุก 30 นาที ป้องกันสายค้าง (Stale connection)
    pool_pre_ping=True         # ✅ เช็คก่อนส่งงานว่าท่อยังไม่ตัน
)

# สร้าง Session สำหรับใช้งานในแต่ละ Request
AsyncSessionLocal = async_sessionmaker(
    bind=engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)

Base = declarative_base()

# Dependency สำหรับฉีดเข้า API
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session