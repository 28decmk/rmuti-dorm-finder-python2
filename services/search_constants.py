FEATURE_SYNONYMS = {
    "has_air_conditioner": [
        "แอร์",
        "เครื่องปรับอากาศ"
    ],

    "has_wifi": [
        "wifi",
        "wi-fi",
        "ไวไฟ",
        "อินเตอร์เน็ต"
    ],

    "has_parking": [
        "ที่จอดรถ",
        "ที่จอด"
    ],

    "has_refrigerator": [
        "ตู้เย็น"
    ],

    "has_furniture": [
        "เฟอร์นิเจอร์"
    ],

    "has_keycard": [
        "คีย์การ์ด",
        "keycard"
    ],

    "has_cctv": [
        "กล้องวงจรปิด",
        "cctv",
        "กล้อง"
    ],

    "has_fitness": [
        "ฟิตเนส",
        "fitness",
        "ยิม"
    ],

    "has_elevator": [
        "ลิฟต์",
        "ลิฟท์"
    ],

    "has_water_heater": [
        "เครื่องทำน้ำอุ่น"
    ],

    "has_security_guard": [
        "รปภ",
        "ยาม"
    ],

    "has_drinking_water": [
        "ตู้น้ำ",
        "น้ำดื่ม"
    ],

    "is_pet_friendly": [
        "เลี้ยงสัตว์",
        "สัตว์เลี้ยง"
    ]
}

INTENT_KEYWORDS = {
    "luxury": [
        "หรู",
        "พรีเมียม",
        "ไฮโซ"
    ],

    "cheap": [
        "ถูก",
        "ราคาถูก",
        "ประหยัด"
    ],

    "safe": [
        "ปลอดภัย"
    ],

    "near_rmuti": [
        "ใกล้มทร",
        "ใกล้มหาลัย",
        "ใกล้มหาวิทยาลัย"
    ]
}


INTENT_RULES = {
    "luxury": {
        "price_weight": 1.0
    },

    "cheap": {
        "price_weight": -1.0
    }
}