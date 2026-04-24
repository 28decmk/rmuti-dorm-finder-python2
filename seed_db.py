import asyncio
import sys
import os

# เพิ่ม Path เพื่อให้ Python หาโฟลเดอร์ app เจอเวลาดึง models/auth
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from app.database import engine
from app.models.user import Admin, Owner  # ตรวจสอบว่า path ตรงกับที่คุณมี
from app.auth import get_password_hash
from sqlalchemy.future import select

# ใช้ชื่อที่ถูกต้องสำหรับ SQLAlchemy 2.0+
SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)

async def seed_data():
    async with SessionLocal() as session:
        print("🚀 Starting to seed data...")
        try:
            # 1. สร้าง Admin
            admin_check = await session.execute(select(Admin).where(Admin.username == "admin"))
            if not admin_check.scalar_one_or_none():
                test_admin = Admin(
                    username="admin",
                    email="admin@test.com",
                    hashed_password=get_password_hash("admin1234"),
                    full_name="System Admin"
                )
                session.add(test_admin)
                print("✅ Admin 'admin' created.")
            
            # 2. สร้าง Owner
            owner_check = await session.execute(select(Owner).where(Owner.username == "owner01"))
            if not owner_check.scalar_one_or_none():
                test_owner = Owner(
                    username="owner01",
                    email="owner@test.com",
                    hashed_password=get_password_hash("owner1234"),
                    phone_number="0812345678",
                    dorm_name="RMUTI Place"
                )
                session.add(test_owner)
                print("✅ Owner 'owner01' created.")

            await session.commit()
            print("🏁 Seeding complete!")
        except Exception as e:
            await session.rollback()
            print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(seed_data())