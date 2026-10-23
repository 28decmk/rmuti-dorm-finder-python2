from pydantic import BaseModel, Field, validator
from typing import List, Any
# ต้อง import schemas หลักเข้ามาด้วย เพื่อเอา DormitoryResponse มาใช้เป็นฐาน
from app import schemas

class ChatMessage(BaseModel):
    # ใช้ Field เพื่อกำหนดข้อจำกัดเบื้องต้นได้เลย
    message: str = Field(..., min_length=1, max_length=300, description="คำถามจากผู้ใช้")


# เพิ่ม Schema สำหรับการค้นหาด้วย AI ไว้ที่นี่
class AIFilters(BaseModel):
    search_keyword: str | None = None
    dorm_type: str | None = None
    price_max: int | None = None
    distance_max: int | None = None
    has_wifi: bool | None = None
    has_air_conditioner: bool | None = None
    has_parking: bool | None = None
    has_laundry: bool | None = None
    is_pet_friendly: bool | None = None
    has_water_heater: bool | None = None
    has_elevator: bool | None = None
    has_furniture: bool | None = None
    has_refrigerator: bool | None = None
    has_keycard: bool | None = None
    has_cctv: bool | None = None
    has_security_guard: bool | None = None
    has_fitness: bool | None = None
    has_drinking_water: bool | None = None

class AISearchResponse(BaseModel):
    is_clear: bool

    sort_preference: str | None = "default"

    suggested_questions: List[str] = []
    dorms: List[Any] # หรือ schemas.DormitoryResponse
    filters: AIFilters # เพิ่มตรงนี้เพื่อให้ Type Hint ชัดเจน