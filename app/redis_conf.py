import os
import redis.asyncio as redis
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

# ดึง URL จาก Environment (ถ้าไม่มีให้ใช้ค่า Default ตามชื่อ Service ใน docker-compose)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

@retry(
    stop=stop_after_attempt(10), # 👈 เพิ่มเป็น 10 ครั้ง
    wait=wait_exponential(multiplier=1, min=2, max=10), # 👈 เริ่มรอ 2 วินาที และนานสุด 10 วินาที
    retry=retry_if_exception_type((redis.ConnectionError, redis.TimeoutError)),
    before_sleep=lambda retry_state: print(f"⏳ Redis ยังไม่พร้อม... กำลังลองใหม่ครั้งที่ {retry_state.attempt_number} (รอ {retry_state.next_action.sleep} วินาที)"), # 👈 เพิ่มบรรทัดนี้เพื่อดูสถานะ
    reraise=True
)
async def get_redis_client(decode_responses=True):
    """สร้าง Redis Client พร้อมระบบ Retry"""
    client = redis.from_url(REDIS_URL, decode_responses=decode_responses)
    await client.ping()  # ตรวจสอบว่าเชื่อมต่อได้จริงไหม
    return client

async def get_redis():
    """Dependency สำหรับใช้ใน API Endpoints"""
    client = await get_redis_client(decode_responses=True)
    try:
        yield client
    finally:
        await client.close()