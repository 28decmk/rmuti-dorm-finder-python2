from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# สำหรับรับข้อมูลจากหน้า Login (รองรับทั้ง Username หรือ Email)
class LoginRequest(BaseModel):
    identity: str  # ผู้ใช้จะกรอก username หรือ email ก็ได้
    password: str

# Schema สำหรับข้อมูล Owner
class OwnerBase(BaseModel):
    username: str
    email: EmailStr # ใช้ EmailStr เพื่อให้ Pydantic ช่วยตรวจสอบรูปแบบอีเมล
    phone_number: Optional[str] = None
    dorm_name: Optional[str] = None

class OwnerRegisterRequest(BaseModel):
    username: str
    email: EmailStr
    first_name: str
    last_name: str
    phone: str
    dorm_name: str   # <--- เพิ่มบรรทัดนี้ เพื่อให้ฝั่ง API ดึงไปใช้ได้
    password: str

class OwnerCreate(OwnerBase):
    password: str

class OwnerResponse(OwnerBase):
    id: int
    is_active: bool
    is_approved: bool # เพิ่มเพื่อให้ Admin รู้สถานะ

    class Config:
        from_attributes = True

# เพิ่มเข้าใน schemas.py
class OwnerUpdate(BaseModel):
    first_name: str
    last_name: str
    phone: str
    dorm_name: str
    is_active: bool

    class Config:
        from_attributes = True


class OwnerMinimal(BaseModel):
    id: int
    first_name: Optional[str] = "ไม่ระบุ"
    last_name: Optional[str] = ""
    email: Optional[str] = None # เปลี่ยนเป็น Optional ชั่วคราวเพื่อเช็ค Error
    phone: Optional[str] = None

    class Config:
        from_attributes = True


# Schema สำหรับข้อมูล Admin
class AdminResponse(BaseModel):
    id: int
    username: str
    email: EmailStr
    full_name: Optional[str] = None

    class Config:
        from_attributes = True


# --- Dormitory Schemas ---

# 1. ข้อมูลพื้นฐานที่ต้องใช้ร่วมกัน
class DormitoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    address: Optional[str] = None
    
    # --- เพิ่ม 2 ฟิลด์นี้เข้าไป ---
    room_type: Optional[str] = None           # เช่น "เตียงเดี่ยว", "เตียงคู่"
    distance_to_rmuti: Optional[str] = None   # เช่น "500 เมตร", "1.2 กม."
    # --------------------------

    dorm_type: str = "หอพักรวม"
    google_map_link: Optional[str] = None
    price_start: int
    vacancy_count: int = 0
    contact_number: str
    line_id: Optional[str] = None
    has_wifi: bool = False
    has_air_conditioner: bool = False
    has_parking: bool = False
    has_laundry: bool = False
    is_pet_friendly: bool = False

    has_water_heater: bool = False
    has_elevator: bool = False
    has_furniture: bool = False
    has_refrigerator: bool = False
    has_keycard: bool = False
    has_cctv: bool = False
    has_security_guard: bool = False
    has_fitness: bool = False
    has_drinking_water: bool = False

# 2. สำหรับใช้รับข้อมูลตอน Owner เพิ่มหอพัก (Create)
class DormitoryCreate(DormitoryBase):
    pass # ใช้ฟิลด์จาก Base ทั้งหมด

# 3. สำหรับส่งข้อมูลรูปภาพกลับไป (Nested ใน DormitoryResponse)
class DormImageResponse(BaseModel):
    id: int
    filename: str

    class Config:
        from_attributes = True



# --- เพิ่ม Schema สำหรับดึงข้อมูลร่าง (Draft) ไปแสดงผล ---
class DormitoryDraftResponse(BaseModel):
    id: int
    dorm_id: int
    name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    room_type: Optional[str] = None
    distance_to_rmuti: Optional[str] = None
    dorm_type: Optional[str] = None
    google_map_link: Optional[str] = None
    price_start: Optional[int] = None
    vacancy_count: Optional[int] = None
    contact_number: Optional[str] = None
    line_id: Optional[str] = None
    
    # Amenities (ใส่ให้ครบเหมือนตารางหลัก)
    has_wifi: bool = False
    has_air_conditioner: bool = False
    has_parking: bool = False
    has_laundry: bool = False
    is_pet_friendly: bool = False
    has_water_heater: bool = False
    has_elevator: bool = False
    has_furniture: bool = False
    has_refrigerator: bool = False
    has_keycard: bool = False
    has_cctv: bool = False
    has_security_guard: bool = False
    has_fitness: bool = False
    has_drinking_water: bool = False
    
    # ข้อมูลรูปภาพ (เก็บเป็น JSON String)
    new_images_json: Optional[str] = "[]"
    delete_image_ids: Optional[str] = "[]"
    updated_at: datetime

    class Config:
        from_attributes = True


# 4. สำหรับส่งข้อมูลหอพักกลับไปแสดงผล (Response)
class DormitoryResponse(DormitoryBase):
    id: int
    is_verified: bool
    owner_id: int

    total_views: int
    # --- เพิ่ม 2 บรรทัดนี้ครับ ---
    verification_status: Optional[str] = "pending" # สถานะการตรวจสอบ
    reject_reason: Optional[str] = None          # เหตุผลที่ปฏิเสธ (ถ้ามี)
    # -----------------------

    # --- เพิ่มบรรทัดนี้ลงไป ---
    owner: Optional[OwnerMinimal] = None 
    # -----------------------

    created_at: datetime
    images: List[DormImageResponse] = [] # จะดึงรายชื่อรูปภาพที่เชื่อมอยู่มาด้วย

    # 🚨 เพิ่มบรรทัดนี้ เพื่อรองรับข้อมูลร่างแก้ไข 🚨
    draft: Optional[DormitoryDraftResponse] = None

    class Config:
        from_attributes = True


# --- View Tracking Schemas ---

# สำหรับรับข้อมูล visitor_id จากหน้าเว็บ
class ViewRecordRequest(BaseModel):
    visitor_id: str

# สำหรับส่งข้อมูลยอดวิวกลับไป (ถ้าต้องการโชว์ในหน้า Dashboard หรือ Card)
class DormViewResponse(BaseModel):
    dorm_id: int
    total_views: int

    class Config:
        from_attributes = True


# --- Booking Schemas (ระบบจองหอพัก) ---

# 1. สำหรับรับข้อมูลการจองจากหน้าบ้าน (นักศึกษากรอก)
class BookingCreate(BaseModel):
    dorm_id: int
    guest_name: str
    guest_phone: str
    check_in_date: datetime  # รับค่าวันที่ (Pydantic จะแปลงจาก string "2024-xx-xx" ให้เอง)
    remark: Optional[str] = None

# 2. สำหรับส่งข้อมูลการจองกลับไป (Response)
class BookingResponse(BaseModel):
    id: int
    dorm_id: int
    guest_name: str
    guest_phone: str
    check_in_date: datetime
    remark: Optional[str] = None
    status: str  # pending, confirmed, cancelled
    created_at: datetime

    class Config:
        from_attributes = True

# 3. สำหรับ Owner (ถ้าต้องการส่งรายชื่อคนจอง พร้อมชื่อหอพัก)
class BookingWithDormResponse(BookingResponse):
    # เชื่อมโยงข้อมูลหอพักแบบย่อกลับไปด้วย (ถ้าต้องการใช้ในหน้า Dashboard Owner)
    dormitory: Optional[DormitoryBase] = None

    class Config:
        from_attributes = True

