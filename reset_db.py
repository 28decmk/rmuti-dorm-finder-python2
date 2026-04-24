import asyncio
import sys
import os
from sqlalchemy import text
from dotenv import load_dotenv

# 1. จัดการ Path ให้ชี้ไปที่ root ของโปรเจกต์
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 2. โหลด .env
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# 3. Import engine และ Models ทั้งหมด 
# (ต้อง Import มาให้ครบเพื่อให้ Base.metadata รู้จักโครงสร้างตารางทั้งหมด)
from app.database import engine, Base
from app.models.user import Admin, Owner
from app.models.dormitory import Dormitory, DormitoryDraft, DormViewLog, DormBooking 
from app.models.dorm_image import DormImage

async def create_missing_tables():
    print(f"📡 กำลังเชื่อมต่อ Database ใน Docker เพื่อเช็คตารางใหม่...")
    try:
        async with engine.begin() as conn:
            # คำสั่งนี้จะทำการ "สร้างเฉพาะตารางที่ยังไม่มี" เท่านั้น
            # ตารางเก่าที่มีอยู่แล้วจะไม่ถูกแตะต้อง และข้อมูลจะไม่หาย
            await conn.run_sync(Base.metadata.create_all)
            
        print("✅ อัปเดตตารางใหม่ (DormBooking) เรียบร้อยแล้ว (ถ้ามีอยู่แล้วจะข้ามให้โดยอัตโนมัติ)")
        print("✨ ภารกิจเสร็จสิ้น!")
    except Exception as e:
        print(f"❌ เกิดข้อผิดพลาด: {e}")

if __name__ == "__main__":
    asyncio.run(create_missing_tables())