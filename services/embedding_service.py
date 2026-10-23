import os

from google import genai


GEMINI_API_KEY = os.getenv(
    "GEMINI_API_KEY"
)

client = genai.Client(
    api_key=GEMINI_API_KEY
)


async def create_query_embedding(
    query: str
):
    """
    สร้าง embedding สำหรับ query ของผู้ใช้
    """

    response = client.models.embed_content(
        model="gemini-embedding-001",
        contents=query
    )

    return response.embeddings[0].values