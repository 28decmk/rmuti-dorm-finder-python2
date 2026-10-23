import os

from google import genai

from sqlalchemy import create_engine, text


DATABASE_URL = os.getenv("DATABASE_URL")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


print("GEMINI_API_KEY =", GEMINI_API_KEY)

genai.configure(api_key=GEMINI_API_KEY)

SYNC_DATABASE_URL = DATABASE_URL.replace(
    "postgresql+asyncpg",
    "postgresql+psycopg2"
)

print(SYNC_DATABASE_URL)

engine = create_engine(SYNC_DATABASE_URL)


def create_embedding(text_content: str):
    response = genai.embed_content(
        model="models/gemini-embedding-001",
        content=text_content,
        task_type="retrieval_document",
    )

    return response["embedding"]


with engine.begin() as conn:

    rows = conn.execute(
        text("""
            SELECT
                id,
                name,
                description
            FROM dormitories
            WHERE embedding IS NULL
        """)
    ).fetchall()

    print(f"Found {len(rows)} dorms")

    for row in rows:

        dorm_text = f"""
        ชื่อหอพัก:
        {row.name}

        รายละเอียด:
        {row.description}

        ประเภท:
        {row.dorm_type}

        ราคา:
        {row.price_start}

        WiFi:
        {row.has_wifi}

        แอร์:
        {row.has_air_conditioner}

        ที่จอดรถ:
        {row.has_parking}

        เฟอร์นิเจอร์:
        {row.has_furniture}
        """

        embedding = create_embedding(dorm_text)

        print(
            f"Dorm {row.id} embedding dims = {len(embedding)}"
        )


        embedding_str = "[" + ",".join(map(str, embedding)) + "]"

        conn.execute(
            text("""
                UPDATE dormitories
                SET embedding = CAST(:embedding AS vector)
                WHERE id = :id
            """),
            {
                "id": row.id,
                "embedding": embedding_str,
            },
        )

        print(f"Embedded dorm {row.id}")