from slowapi import Limiter
from slowapi.util import get_remote_address

# สร้าง instance ของ Limiter ไว้ที่นี่
# เราจะใช้ IP ของผู้ใช้ (get_remote_address) เป็นตัวระบุตัวตนในการจำกัดจำนวนครั้ง
ai_limiter = Limiter(key_func=get_remote_address)