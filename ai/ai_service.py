import os
import json
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
)

async def get_ai_response(dorm_data: dict, user_message: str):
    # --- 1. เตรียมข้อมูลแบบอ่านง่ายที่สุด ---
    # แปลง dorm_data ที่ได้รับจาก DB (ที่เป็น dict) ให้เป็น JSON ที่สะอาดตา
    # เราจะกรองเอาเฉพาะข้อมูลที่สำคัญจริงๆ ส่งไปให้ AI
    
    # --- ปรับส่วนรายละเอียดห้องพัก ---
    room_list = []
    for rt in dorm_data.get("room_types", []):
        # สร้าง List ของสิ่งอำนวยความสะดวกที่มีเฉพาะในห้องนี้
        amenities = []
        if rt.get("has_air_conditioner"): amenities.append("แอร์")
        if rt.get("has_fan"): amenities.append("พัดลม")
        if rt.get("has_refrigerator"): amenities.append("ตู้เย็น")
        if rt.get("has_tv"): amenities.append("ทีวี")
        if rt.get("has_water_heater"): amenities.append("เครื่องทำน้ำอุ่น")
        if rt.get("has_balcony"): amenities.append("ระเบียง")
        # ... เพิ่ม field อื่นๆ ตามต้องการ
        
        room_info = (
            f"ชื่อห้อง: {rt.get('name')}, "
            f"ราคา: {rt.get('price')} บาท, "
            f"สถานะ: ว่าง {rt.get('vacancy_count')} ห้อง, "
            f"สิ่งอำนวยความสะดวก: {', '.join(amenities) if amenities else 'ไม่มีระบุ'}, "
            f"รายละเอียดเพิ่มเติม: {rt.get('description', 'ไม่มี')}"
        )
        room_list.append(room_info)

    clean_data = {
        "ชื่อหอพัก": dorm_data.get("name"),
        "ประเภทหอพัก": dorm_data.get("dorm_type"),
        "ที่อยู่": dorm_data.get("address"), # เพิ่มบรรทัดนี้
        "ลิงก์แผนที่": dorm_data.get("google_map_link"), # เพิ่มบรรทัดนี้เพื่อความสะดวก
        "ระยะทางจาก มทร.": dorm_data.get("distance_to_rmuti"),
        "ราคาเริ่มต้น": dorm_data.get("price_start"),
        "รายละเอียดเพิ่มเติม": dorm_data.get("description"),
        "ข้อมูลติดต่อ": {"โทร": dorm_data.get("contact_number"), "Line": dorm_data.get("line_id")},
        "สิ่งอำนวยความสะดวกส่วนกลาง": {k: v for k, v in dorm_data.items() if k.startswith("has_") and v is True},
        "สถานะห้องพักรวม": f"ว่าง {dorm_data.get('vacancy_count', 0)} ห้อง",
        "รายละเอียดประเภทห้อง": room_list # <-- เปลี่ยนจาก dorm_data.get("room_types", []) เป็น room_list ที่คุณ Loop ไว้ด้านบนครับ
    }

    # --- 2. ปรับ Prompt ให้ฉลาดขึ้น ---
    system_instruction = (
        "คุณคือ 'พี่หอพัก' ใจดีที่รู้ลึกเรื่องหอพักนี้มาก ข้อมูลของคุณคือ JSON ด้านล่างนี้ "
        "หน้าที่ของคุณคือ:\n"
        "1. ตอบคำถามอย่างเป็นธรรมชาติ ห้ามตอบแบบหุ่นยนต์\n"
        "2. หากมีข้อมูลใน JSON ให้ตอบตามนั้น\n"
        "3. หากไม่มีข้อมูล (เช่น เครื่องซักผ้า) ให้ตอบว่า 'ยังไม่มีข้อมูลส่วนนี้ค่ะ/ครับ' อย่าเดา\n"
        "4. ถ้าถามถึงห้องพัก ให้ดูใน 'รายละเอียดประเภทห้อง' แล้วสรุปข้อมูลให้เข้าใจง่าย"
        "5. ถ้าผู้ใช้ถามหาห้องประเภทที่ไม่มี (เช่น ห้องพัดลม) ให้บอกว่าไม่มีห้องประเภทนั้น แต่ให้เสนอห้องที่ใกล้เคียงที่สุดที่มีอยู่ใน 'รายละเอียดประเภทห้อง' ให้กับผู้ใช้ด้วย เช่น 'ปัจจุบันไม่มีห้องพัดลมแยกนะคะ แต่เรามีห้องแอร์ที่มีพัดลมในตัวให้บริการอยู่ค่ะ สนใจดูรายละเอียดไหมคะ?"

        # --- เพิ่มข้อกำหนดเรื่องการจัดรูปแบบ (Formatting Rules) ---

        "กฎการตอบ (Formatting Rules):\n"
        "1. ใช้การเว้นบรรทัด (Line breaks) ในทุกหัวข้อเพื่อให้ข้อความอ่านง่าย\n"
        "2. ใช้ Bullet points (-) หรือตัวเลข (1., 2.) สำหรับการลิสต์ข้อมูล\n"
        "3. ใช้อีโมจิ (Emoji) อย่างเหมาะสม เพื่อให้การสนทนาดูเป็นกันเองและสดใส ไม่ควรใช้เยอะจนเกินไป\n"
        "4. ใช้ภาษาที่สุภาพ เป็นกันเองเหมือนพี่คุยกับน้อง\n"
        "5. หากเป็นการสรุปข้อดี/ข้อเสีย ให้ทำสรุปเป็นข้อๆ เสมอ"
    )

    prompt = f"ข้อมูลหอพัก: {json.dumps(clean_data, ensure_ascii=False, indent=2)}\n\nคำถาม: {user_message}"
    
    # --- 3. เรียก AI ---
    response = client.chat.completions.create(
        model="google/gemini-2.0-flash-001",
        messages=[
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": prompt}
        ],
        extra_headers={"HTTP-Referer": "http://localhost:8000", "X-Title": "ITMSU Hackathon AI"}
    )
    return response.choices[0].message.content 