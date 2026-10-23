import os
import json
import re 
from google import genai
from google.genai import types  

# เรียกใช้งาน Client โครงสร้างของ Google SDK ตัวใหม่
client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)

# 1. ฟังก์ชันทำความสะอาด JSON (คงเดิม)
def clean_json_string(raw: str) -> str:
    raw = re.sub(r"```json|```", "", raw).strip()
    raw = raw.replace("\u200b", "").replace("\ufeff", "")

    # ถ้าเป็น JSON Array
    array_match = re.search(r"\[.*\]", raw, re.DOTALL)
    if array_match:
        return array_match.group(0)

    # ถ้าเป็น JSON Object
    obj_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if obj_match:
        return obj_match.group(0)

    return raw


async def get_ai_intent(user_message: str) -> dict:
    """
    ฟังก์ชันสำหรับแปลงความต้องการของผู้ใช้ (Natural Language) 
    ให้กลายเป็นตารางตัวกรองข้อมูล (JSON/Dict) เพื่อนำไปใช้ค้นหาในฐานข้อมูลต่อไป
    """
    
    # 1. นิยามคำสั่งระบบ (System Instruction)
    system_instruction = (
        "คุณคือ AI ผู้ช่วยค้นหาหอพักรอบ มทร.อีสาน วิทยาเขตขอนแก่น "
        "เป้าหมายของคุณคือการสกัด Intent ของผู้ใช้ให้แม่นยำที่สุดเพื่อให้ระบบ Query ฐานข้อมูลได้ถูกต้อง\n\n"
        "หน้าที่: วิเคราะห์สิ่งที่ผู้ใช้พิมพ์ และตัดสินใจว่าต้องใช้คำสั่ง SQL หรือ Python ในการจัดการผลลัพธ์\n\n"
        "RULES:\n"
        "- intent: 'search' (ค้นหาทั่วไป), 'sort' (ต้องการเรียงลำดับ)\n"
        "- sort_preference: 'distance' (ถ้าผู้ใช้ถามหาใกล้ที่สุด), 'relevance' (ถ้าผู้ใช้พูดถึงบรรยากาศ/สเปคที่ต้องวิเคราะห์), 'default' (ถ้าไม่ระบุ)\n"
        "- filters: ดึงข้อมูลฟิลเตอร์ (ราคา, สิ่งอำนวยความสะดวก) ตามปกติ\n"
        "- keywords: สกัดคำหลักที่ผู้ใช้พิมพ์\n\n"
        "ถ้าผู้ใช้ถาม 'หอที่ใกล้ที่สุด' หรือ 'ใกล้ มทร สุด' -> ให้ตั้ง sort_preference='distance'\n"
        "ถ้าผู้ใช้ถาม 'หอสวย บรรยากาศดี' หรือ 'หอพักน่าอยู่' 'สภาพแวดล้อมที่เอื้อต่อการเรียน' 'เหมาะสำหรับอ่านหนังสือ' 'หอเงียบ' 'หอน่าอยู่' 'บรรยากาศดี'-> ให้ตั้ง sort_preference='relevance'\n"
        "ห้ามใช้ Key ว่า 'amenities' เด็ดขาด! ให้ส่งฟิลด์ Boolean ทั้งหมด (has_wifi, has_cctv, ...) ออกมาในระดับ Root JSON เท่านั้น ห้าม Nested\n"
        "ถ้าผู้ใช้ถามหาสิ่งที่ไม่มีปุ่ม boolean (เช่น 'สภาพแวดล้อมที่เอื้อต่อการเรียน', 'บรรยากาศเงียบ', 'ปลอดภัย') "
        "ให้ตั้ง sort_preference='relevance' และใส่คำเหล่านั้นใน search_keyword เพื่อให้ระบบค้นใน description\n\n"
        "DATABASE MAPPING RULES:\n"
        "1. Boolean Amenities: ตรวจสอบและตั้งค่าเป็น true หากผู้ใช้ระบุถึงฟีเจอร์ต่อไปนี้:\n"
        "- wifi, air_conditioner (แอร์), parking (ที่จอดรถ), laundry (ซักรีด),\n"
        "- pet_friendly (สัตว์เลี้ยง), water_heater (เครื่องทำน้ำอุ่น), elevator (ลิฟต์),\n"
        "- furniture (เฟอร์นิเจอร์), refrigerator (ตู้เย็น), keycard (คีย์การ์ด),\n"
        "- cctv (กล้องวงจรปิด), security_guard (รปภ.), fitness (ฟิตเนส), drinking_water (ตู้น้ำ)\n\n"
        "2. สำคัญมาก: หากมีการระบุสิ่งเหล่านี้ ห้ามนำไปใส่ใน search_keyword ให้ใส่ค่า true ใน field ที่เกี่ยวข้องเท่านั้น\n"
        "3. search_keyword: ใช้สำหรับสิ่งที่ไม่มีในรายการด้านบนเท่านั้น (เช่น 'ของกินเยอะ', 'บรรยากาศดี', 'ร้านค้าเยอะ')\n"
        "4. สำคัญ: หากผู้ใช้ระบุถึงฟีเจอร์เหล่านี้ ต้องส่งค่าเป็น true เท่านั้น ห้ามส่ง null หรือ false หากผู้ใช้ต้องการ\n"
        "5. LOCATION & DESCRIPTION: หากผู้ใช้ถามหาใกล้สถานที่สำคัญ (เช่น ใกล้ 7-11, หน้า มทร, ตลาด) หรือถามหาฟีเจอร์ที่ไม่มีปุ่มกด (เช่น สระว่ายน้ำ, สาวสวย, ปลอดภัย) ให้คัดลอกคำหรือวลีสำคัญนั้นลงใน search_keyword เสมอ\n"
        "6. FLEXIBILITY: ห้ามตัดคำสำคัญทิ้ง หากข้อมูลไม่ตรงกับ Boolean filter ให้มองว่าเป็น Keywords ทั้งหมด\n\n"
        "STRICT RULES:\n"
        "1. ตอบกลับเป็น JSON เท่านั้น ห้ามมีคำอธิบายอื่น\n"
        "2. ต้องแยกให้ขาดระหว่างสิ่งที่ตรวจเช็คได้ (Boolean) และสิ่งที่ต้องค้นหาในข้อความ (Keyword)\n"
        "3. ถ้าผู้ใช้พิมพ์สั้นๆ แล้วไม่มีเงื่อนไขชัดเจน ให้ตั้ง is_clear = true และส่งผลลัพธ์โดยให้ filters เป็น null ทั้งหมด\n\n"
        "EXAMPLES:\n"
        "User: 'หาหอพักราคาไม่เกิน 2300'\n"
        "JSON: {\"is_clear\": true, \"sort_preference\": \"default\", \"suggested_questions\": [], \"filters\": {\"search_keyword\": null, \"dorm_type\": null, \"price_max\": 2300, \"distance_max\": null, \"has_wifi\": null...}}\n\n"
        "User: 'หอใกล้ร้านสะดวกซื้อ ของกินเยอะ'\n"
        "JSON: {\"is_clear\": true, \"sort_preference\": \"relevance\", \"suggested_questions\": [], \"filters\": {\"search_keyword\": \"ร้านสะดวกซื้อ ของกินเยอะ\", \"price_max\": null...}}"
    )

    # 2. กำหนด JSON Schema
    response_schema = {
        "type": "OBJECT",
        "properties": {
            "is_clear": {"type": "BOOLEAN"},
            "sort_preference": {
                "type": "STRING",
                "enum": ["default", "distance", "relevance"]
            },
            "suggested_questions": {"type": "ARRAY", "items": {"type": "STRING"}},
            "filters": {
                "type": "OBJECT",
                "properties": {
                    "search_keyword": {"type": "STRING", "nullable": True},
                    "dorm_type": {"type": "STRING", "nullable": True},
                    "price_max": {"type": "INTEGER", "nullable": True},
                    "distance_max": {"type": "INTEGER", "nullable": True},
                    "has_wifi": {"type": "BOOLEAN", "nullable": True},
                    "has_air_conditioner": {"type": "BOOLEAN", "nullable": True},
                    "has_parking": {"type": "BOOLEAN", "nullable": True},
                    "has_laundry": {"type": "BOOLEAN", "nullable": True},          
                    "is_pet_friendly": {"type": "BOOLEAN", "nullable": True},
                    "has_water_heater": {"type": "BOOLEAN", "nullable": True},    
                    "has_elevator": {"type": "BOOLEAN", "nullable": True},
                    "has_furniture": {"type": "BOOLEAN", "nullable": True},       
                    "has_refrigerator": {"type": "BOOLEAN", "nullable": True},    
                    "has_keycard": {"type": "BOOLEAN", "nullable": True},
                    "has_cctv": {"type": "BOOLEAN", "nullable": True},
                    "has_security_guard": {"type": "BOOLEAN", "nullable": True},  
                    "has_fitness": {"type": "BOOLEAN", "nullable": True},
                    "has_drinking_water": {"type": "BOOLEAN", "nullable": True}   
                },
                "required": [
                    "search_keyword", "dorm_type", "price_max", "distance_max",
                    "has_wifi", "has_air_conditioner", "has_parking", "has_laundry",
                    "is_pet_friendly", "has_water_heater", "has_elevator", "has_furniture",
                    "has_refrigerator", "has_keycard", "has_cctv", "has_security_guard",
                    "has_fitness", "has_drinking_water"
                ]
            }
        },
        "required": ["is_clear", "sort_preference", "suggested_questions", "filters"]
    }

    raw_content = ""
    clean_content = ""
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=f"User Query: {user_message}",
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.0,
                max_output_tokens=500,
                response_mime_type="application/json",
                response_schema=response_schema
            )
        )
        
        raw_content = response.text.strip()
        clean_content = clean_json_string(raw_content)
        result_json = json.loads(clean_content)

        if "sort_preference" not in result_json:
            result_json["sort_preference"] = "default"
        
        return result_json

    except Exception as e:
        print(f"Intent Extraction Error: {e} | raw: {raw_content[:200]}")
        
        # --- ปรับปรุง FALLBACK ยืดหยุ่น: ดึงราคา และยังคงรักษาคีย์เวิร์ดของผู้ใช้ไว้ห้ามทิ้ง ---
        extracted_price = None
        price_match = re.search(r'(?:ไม่เกิน|ราคา|งบ|งบไม่เกิน)\s*(\d+)', user_message)
        if not price_match:
            price_match = re.search(r'(\d{4})', user_message)
        if price_match:
            try:
                extracted_price = int(price_match.group(1))
            except:
                pass

        # ดึงประโยคเดิมมาเป็น search_keyword เผื่อกรณีเข้ายกเว้น จะได้ไม่หลุดข้อมูลตัวกรองหลัก
        return {
            "is_clear": True,
            "sort_preference": "default",
            "suggested_questions": [],
            "filters": {
                "search_keyword": user_message if not extracted_price else None, 
                "dorm_type": None, 
                "price_max": extracted_price, 
                "distance_max": None,
                "has_wifi": None, "has_air_conditioner": None, "has_parking": None, "has_laundry": None,
                "is_pet_friendly": None, "has_water_heater": None, "has_elevator": None, "has_furniture": None,
                "has_refrigerator": None, "has_keycard": None, "has_cctv": None, "has_security_guard": None,
                "has_fitness": None, "has_drinking_water": None
            }
        }


async def ai_rerank_results(dorms: list, user_query: str) -> list:
    print("=== RERANK INPUT TYPE ===")
    if dorms:
        print(type(dorms[0]))
    print("=========================")

    if not dorms:
        return []

    """
    ส่งรายการหอพักไปให้ AI ช่วยจัดลำดับตามความเกี่ยวข้องกับคำค้นหา
    """
    simplified_dorms = [
        {
            "id": d["id"] if isinstance(d, dict) else d.id,
            "name": (d.get("name", "") if isinstance(d, dict) else d.name)[:50],
            "desc": ((d.get("description") or "") if isinstance(d, dict) else (d.description or ""))[:1000],
            "distance": d.get("distance_to_rmuti") if isinstance(d, dict) else d.distance_to_rmuti,
            "price": d.get("price_start") if isinstance(d, dict) else d.price_start,
        }
        for d in dorms[:30]
    ]

    print("\n=== [DEBUG] Simplified Dorms sent to Gemini ===")
    print(json.dumps(simplified_dorms, ensure_ascii=False, indent=2))
    print("===============================================\n")

    example_json = """
[
  {
    "id": 102,
    "score": 98
  },
  {
    "id": 101,
    "score": 40
  }
]
"""

    prompt = f"""
    คุณคือผู้เชี่ยวชาญการจัดลำดับหอพัก จงเรียงลำดับหอพักเหล่านี้ให้ตรงกับความต้องการของผู้ใช้มากที่สุด
    คำค้นหาผู้ใช้: {user_query}

    รายการหอพัก:
    {json.dumps(simplified_dorms, ensure_ascii=False)}

    หลักการให้คะแนน
    - ตรงกับคำที่พิมพ์ตรงๆ หรือในแง่ความหมายของบริบท (เช่น ค้นหาคำว่า สาว มทร ให้ดูคำบรรยายที่บอกว่า นักศึกษาหญิงอยู่เยอะ หรือใกล้ มทร. เป็นต้น) ให้คะแนนสูงตามความเหมาะสม
    - หากผู้ใช้ค้นหา: เหมาะกับการเรียน / เงียบสงบ / มีสมาธิ ให้คะแนนสูงกับคำบรรยายที่ระบุว่า บรรยากาศเงียบ, เป็นส่วนตัว, สงบ
    - หากผู้ใช้ค้นหา: ปลอดภัย ให้คะแนนสูงกับ: CCTV, กล้องวงจรปิด, รปภ., คีย์การ์ด

    จงเรียงลำดับหอพักจาก "ตรงความต้องการมากที่สุด" ไป "น้อยที่สุด" โดยให้คะแนนตั้งเเต่ 0 ถึง 100

    รูปแบบผลลัพธ์ที่ต้องการ (ตอบเป็น JSON Array ของ Object เท่านั้น):
    {example_json}

    กฎเด็ดขาด:
    1. คืนค่าเป็น JSON Array ของ Object ที่มี "id" และ "score" เท่านั้น
    2. ห้ามมีคำอธิบายอื่นนอกเหนือจาก JSON Array นี้นอกกรอบโครงสร้างเด็ดขาด
    """

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.0,
                max_output_tokens=500  
            )
        )
        
        content = response.text.strip()

        print("=== GEMINI RAW RESPONSE ===")
        print(content)
        print("===========================")

        results = json.loads(clean_json_string(content))

        print("=== AI SCORES BEFORE FILTER ===")
        print(json.dumps(results, ensure_ascii=False, indent=2))

        if results and isinstance(results, list) and len(results) > 0 and "score" in results[0]:
            top_score = results[0]["score"]
            filtered_results = [
                item for item in results
                if item.get("score", 0) >= top_score * 0.5
            ]

            print("=== AI SCORES AFTER FILTER ===")
            print(json.dumps(filtered_results, ensure_ascii=False, indent=2))

            if filtered_results:
                results = filtered_results

        # คัดเอาเฉพาะ ID ที่ผ่านการกรองคะแนนแล้วมาจัดกลุ่มใหม่
        sorted_ids = [item["id"] for item in results if "id" in item]
        
        # --- [แก้ไขจุดสำคัญเพื่อให้กลับมาทำงานเหมือนเดิม] ---
        # นำ ID ที่เรียงลำดับแล้วไป map กลับไปเป็น Object หอพักชุดเดิมของระบบ ไม่ใช่ส่งคืนแค่เลข ID ตัวเปล่า
        id_map = { (d["id"] if isinstance(d, dict) else d.id): d for d in dorms }
        reranked_dorms = [id_map[dorm_id] for dorm_id in sorted_ids if dorm_id in id_map]
        
        return reranked_dorms

    except Exception as e:
        print(f"Reranking Error: {e}")
        return dorms  # หาก AI ตกสภาวะขัดข้อง ให้สลัดกลับไปใช้ข้อมูล List ดั้งเดิมเพื่อความปลอดภัย