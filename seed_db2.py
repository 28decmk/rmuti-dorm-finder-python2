import asyncio
import sys
import os

# เพิ่ม Path เพื่อให้ Python หาโฟลเดอร์ app เจอ
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import async_sessionmaker
from app.database import engine
from app.models.user import Admin  # Import เฉพาะ Admin
from app.auth import get_password_hash
from sqlalchemy.future import select

# ใช้ชื่อที่ถูกต้องสำหรับ SQLAlchemy 2.0+
SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)

async def seed_data():
    async with SessionLocal() as session:
        print("🚀 Starting to seed Admin data...")
        try:
            # 1. เช็คว่ามี Admin ชื่อ 'admin' หรือยัง
            query = select(Admin).where(Admin.username == "admin")
            result = await session.execute(query)
            admin_check = result.scalar_one_or_none()

            if not admin_check:
                test_admin = Admin(
                    username="admin",
                    email="admin@test.com",
                    hashed_password=get_password_hash("admin1234"), # รหัสผ่าน: admin1234
                    full_name="System Admin",
                    is_active=True
                )
                session.add(test_admin)
                print("✅ Admin 'admin' created successfully.")
            else:
                print("ℹ️ Admin 'admin' already exists.")

            await session.commit()
            print("🏁 Seeding complete!")
            
        except Exception as e:
            await session.rollback()
            print(f"❌ Error during seeding: {e}")

if __name__ == "__main__":
    asyncio.run(seed_data())