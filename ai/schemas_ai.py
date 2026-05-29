from pydantic import BaseModel, Field

class ChatMessage(BaseModel):
    # ใช้ Field เพื่อกำหนดข้อจำกัดเบื้องต้นได้เลย
    message: str = Field(..., min_length=1, max_length=300, description="คำถามจากผู้ใช้")