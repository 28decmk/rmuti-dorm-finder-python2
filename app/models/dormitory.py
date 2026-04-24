from sqlalchemy import Column, Integer, String, Text, ForeignKey, Boolean, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class Dormitory(Base):
    __tablename__ = "dormitories"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(Text)
    address = Column(String, index=True)
    
    # --- คอลัมน์ที่เพิ่มใหม่ตามที่คุณต้องการ ---
    room_type = Column(String, nullable=True) # เช่น เตียงเดี่ยว/คู่ (พิมพ์เอาเอง)
    distance_to_rmuti = Column(String, nullable=True) # เช่น 500 เมตร / 1.5 กม.
    # -------------------------------------

    # ประเภทหอพัก (หอพักชาย/หอพักหญิง/หอพักรวม)
    dorm_type = Column(String, default="หอพักรวม") # เพิ่มใหม่
    
    google_map_link = Column(String, nullable=True) 
    
    price_start = Column(Integer)
    # จำนวนห้องว่างปัจจุบัน
    vacancy_count = Column(Integer, default=0) # เพิ่มใหม่
    
    contact_number = Column(String)
    line_id = Column(String, nullable=True)
    
    # สิ่งอำนวยความสะดวก
    has_wifi = Column(Boolean, default=False)
    has_air_conditioner = Column(Boolean, default=False)
    has_parking = Column(Boolean, default=False)
    has_laundry = Column(Boolean, default=False)
    is_pet_friendly = Column(Boolean, default=False)

    # เพิ่มเติมมาตรฐานสากล
    has_water_heater = Column(Boolean, default=False)      # เครื่องทำน้ำอุ่น
    has_elevator = Column(Boolean, default=False)          # ลิฟต์
    has_furniture = Column(Boolean, default=False)         # เฟอร์นิเจอร์ครบชุด
    has_refrigerator = Column(Boolean, default=False)      # ตู้เย็น
    has_keycard = Column(Boolean, default=False)           # ประตูคีย์การ์ด
    has_cctv = Column(Boolean, default=False)              # กล้องวงจรปิด
    has_security_guard = Column(Boolean, default=False)    # รปภ.
    has_fitness = Column(Boolean, default=False)           # ฟิตเนส
    has_drinking_water = Column(Boolean, default=False)    # ตู้น้ำหยอดเหรียญ
    
    # สถานะการตรวจสอบ: 'pending' (รอ), 'approved' (ผ่าน), 'rejected' (ไม่ผ่าน)
    verification_status = Column(String, default="pending") 
    # เหตุผลที่ไม่ผ่าน (ถ้ามี)
    reject_reason = Column(Text, nullable=True)

    # ระบบตรวจสอบ
    is_verified = Column(Boolean, default=False)
    
    # บันทึกเวลาที่สร้างหอพักนี้
    created_at = Column(DateTime, default=datetime.utcnow) # เพิ่มใหม่
    
    # เชื่อมโยงกับ Owner
    owner_id = Column(Integer, ForeignKey("owners.id"))
    owner = relationship("Owner", back_populates="dormitories")
    
    # เชื่อมโยงกับรูปภาพ
    images = relationship("DormImage", back_populates="dormitory", cascade="all, delete-orphan")

    # 🚨 เพิ่มบรรทัดนี้: เพื่อเชื่อมไปยังข้อมูลร่าง (Draft)
    draft = relationship("DormitoryDraft", back_populates="dormitory", uselist=False, cascade="all, delete-orphan")

    # --- เพิ่มฟิลด์เก็บสถิติยอดวิวรวม ---
    total_views = Column(Integer, default=0)

    view_logs = relationship("DormViewLog", back_populates="dormitory", cascade="all, delete-orphan")

    # เชื่อมโยงกับการจอง
    bookings = relationship("DormBooking", back_populates="dormitory", cascade="all, delete-orphan")


# 🚨 เพิ่มคลาสนี้ต่อท้ายไฟล์ dormitory.py 🚨
class DormitoryDraft(Base):
    __tablename__ = "dormitory_drafts"

    id = Column(Integer, primary_key=True, index=True)
    dorm_id = Column(Integer, ForeignKey("dormitories.id", ondelete="CASCADE"), unique=True)
    
    # คัดลอก Field ทั้งหมดจาก Dormitory มาไว้ที่นี่เพื่อเก็บค่าที่ "กำลังขอแก้ไข"
    name = Column(String)
    description = Column(Text)
    address = Column(String)
    room_type = Column(String)
    distance_to_rmuti = Column(String)
    dorm_type = Column(String)
    google_map_link = Column(String)
    price_start = Column(Integer)
    vacancy_count = Column(Integer)
    contact_number = Column(String)
    line_id = Column(String)

    # สิ่งอำนวยความสะดวก (Draft)
    has_wifi = Column(Boolean)
    has_air_conditioner = Column(Boolean)
    has_parking = Column(Boolean)
    has_laundry = Column(Boolean)
    is_pet_friendly = Column(Boolean)
    has_water_heater = Column(Boolean)
    has_elevator = Column(Boolean)
    has_furniture = Column(Boolean)
    has_refrigerator = Column(Boolean)
    has_keycard = Column(Boolean)
    has_cctv = Column(Boolean)
    has_security_guard = Column(Boolean)
    has_fitness = Column(Boolean)
    has_drinking_water = Column(Boolean)

    # 🚨 ฟิลด์พิเศษสำหรับจัดการรูปภาพใน Draft
    # เก็บเป็น JSON String เช่น ["new_file1.jpg", "new_file2.jpg"]
    new_images_json = Column(Text, default="[]") 
    # เก็บ ID รูปภาพเดิมที่เจ้าของกด "ลบ" ในหน้าแก้ไข
    delete_image_ids = Column(Text, default="[]") 

    updated_at = Column(DateTime, default=datetime.utcnow)

    # เชื่อมกลับไปยังหอพักหลัก
    dormitory = relationship("Dormitory", back_populates="draft")


class DormViewLog(Base):
    __tablename__ = "dorm_view_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    dorm_id = Column(Integer, ForeignKey("dormitories.id", ondelete="CASCADE"))
    visitor_id = Column(String, index=True) # ID จาก localStorage (v-xxxxxx)
    ip_address = Column(String, nullable=True) # เก็บ IP เพื่อความปลอดภัย
    viewed_at = Column(DateTime, default=datetime.utcnow)

    # เชื่อมกลับไปยังหอพัก
    dormitory = relationship("Dormitory", back_populates="view_logs")

    # 🔒 หัวใจสำคัญ: ป้องกันการปั๊มยอดระดับ Database
    # 1 เครื่อง (visitor_id) ต่อ 1 หอพัก (dorm_id) จะมีได้แค่ Record เดียว
    __table_args__ = (
        UniqueConstraint('dorm_id', 'visitor_id', name='_dorm_visitor_uc'),
    )


class DormBooking(Base):
    __tablename__ = "dorm_bookings"

    id = Column(Integer, primary_key=True, index=True)
    dorm_id = Column(Integer, ForeignKey("dormitories.id", ondelete="CASCADE"))
    
    # ข้อมูลผู้จอง
    guest_name = Column(String, nullable=False)
    guest_phone = Column(String, nullable=False)
    check_in_date = Column(DateTime, nullable=False) # วันที่คาดว่าจะเข้าอยู่
    remark = Column(Text, nullable=True) # หมายเหตุ
    
    # สถานะการจอง: 'pending' (รอเจ้าของติดต่อกลับ), 'confirmed' (ยืนยันแล้ว), 'cancelled' (ยกเลิก)
    status = Column(String, default="pending") 
    
    created_at = Column(DateTime, default=datetime.utcnow)

    # เชื่อมกลับไปยังหอพัก
    dormitory = relationship("Dormitory", back_populates="bookings")