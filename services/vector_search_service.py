print("VECTOR SEARCH VERSION 1000")

import os
import google.generativeai as genai

from sqlalchemy import text
from app.database import AsyncSessionLocal
from app.models.dormitory import Dormitory


genai.configure(
    api_key=os.getenv("GEMINI_API_KEY")
)


def create_query_embedding(query: str):

    response = genai.embed_content(
        model="models/gemini-embedding-001",
        content=query,
        task_type="retrieval_query"
    )

    return response["embedding"]


async def vector_search(
    query: str,
    candidate_ids: list[int],       # ← เพิ่ม: รับ id จาก SQL Filter
    filters: dict | None = None,
    limit: int = 50                 # ← เพิ่ม default เป็น 50
):

    # ถ้าไม่มี candidate เลย ไม่ต้องค้น
    if not candidate_ids:
        return []

    filters = filters or {}

    query_embedding = create_query_embedding(query)

    conditions = [
        "id = ANY(:candidate_ids)",     # ← จุดสำคัญ: กรองเฉพาะ candidate
        "embedding IS NOT NULL",
        "description IS NOT NULL",
        "length(description) > 30"
    ]

    params = {
        "embedding": str(query_embedding),
        "candidate_ids": candidate_ids,  # ← ส่ง list เข้าไปตรงๆ
        "limit": limit
    }

    # ── ลบ filters block เดิมออกทั้งหมด ──
    # เหตุผล: SQL Filter ใน main.py กรอง boolean/price ไปแล้ว
    # ถ้ากรองซ้ำที่นี่อีกรอบไม่มีผลเสียแต่เพิ่ม complexity โดยไม่จำเป็น

    async with AsyncSessionLocal() as db:

        where_clause = " AND ".join(conditions)

        print("CANDIDATE IDS COUNT =", len(candidate_ids))
        print("WHERE =", where_clause)

        sql = text(f"""
            SELECT
                id,
                name,
                description,
                address,
                price_start,
                dorm_type,
                room_type,
                distance_to_rmuti,
                total_views,

                has_wifi,
                has_air_conditioner,
                has_parking,
                has_refrigerator,
                has_furniture,
                has_keycard,
                has_cctv,
                has_fitness,
                has_elevator,
                has_water_heater,
                has_security_guard,
                has_drinking_water,
                is_pet_friendly,

                embedding <=> CAST(:embedding AS vector) AS distance
            FROM dormitories
            WHERE {where_clause}
            ORDER BY distance
            LIMIT :limit
        """)

        result = await db.execute(sql, params)
        rows = result.mappings().all()

        for row in rows:
            print(
                row["name"],
                float(row["distance"])
            )

        return [
            {
                "id": row["id"],
                "name": row["name"],
                "description": row["description"],
                "address": row["address"],
                "price_start": row["price_start"],
                "dorm_type": row["dorm_type"],
                "room_type": row["room_type"],
                "distance_to_rmuti": row["distance_to_rmuti"],
                "total_views": row["total_views"],

                "has_wifi": row["has_wifi"],
                "has_air_conditioner": row["has_air_conditioner"],
                "has_parking": row["has_parking"],
                "has_refrigerator": row["has_refrigerator"],
                "has_furniture": row["has_furniture"],
                "has_keycard": row["has_keycard"],
                "has_cctv": row["has_cctv"],
                "has_fitness": row["has_fitness"],
                "has_elevator": row["has_elevator"],
                "has_water_heater": row["has_water_heater"],
                "has_security_guard": row["has_security_guard"],
                "has_drinking_water": row["has_drinking_water"],
                "is_pet_friendly": row["is_pet_friendly"],

                "distance": float(row["distance"])
            }
            for row in rows
            if float(row["distance"]) < 0.35  # ← threshold เดิม คงไว้
        ]