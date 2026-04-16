import requests
import time

# 1. ใส่ URL ที่เป็น Public แล้ว
URL = "https://humble-trout-4j6w69vjx4g4hj759-8000.app.github.dev/api/auth/register-owner"

def run_test():
    # ข้อมูลเดิมยิงซ้ำได้เลย เพราะเราจะดูว่ามันโดนบล็อกที่ชั้น Rate Limit หรือไม่
    payload = {
        "username": "test_user_limit",
        "email": "test@limit.com",
        "password": "password123",
        "first_name": "Test",
        "last_name": "RateLimit",
        "phone": "0800000000",
        "dorm_name": "Test Dorm"
    }

    print("--- เริ่มการทดสอบยิง API 10 ครั้งรวด ---")

    for i in range(1, 11):
        try:
            # ยิงตรงๆ เข้า API
            response = requests.post(URL, json=payload)
            
            # ถ้าติด Rate Limit จะได้ 429
            if response.status_code == 429:
                print(f"ครั้งที่ {i}: [🔴 ติด Limit!] - {response.json()['detail']}")
            else:
                # ถ้าได้ 200 หรือ 400 (ข้อมูลซ้ำ) แสดงว่า "ผ่าน" ชั้น Rate Limit เข้าไปได้
                print(f"ครั้งที่ {i}: [🟢 ผ่านชั้น Limit] - Status: {response.status_code}")
                
        except Exception as e:
            print(f"ครั้งที่ {i}: Error - {e}")
        
        # ยิงรัวๆ ไม่ต้องพัก
        time.sleep(0.1)

if __name__ == "__main__":
    run_test()