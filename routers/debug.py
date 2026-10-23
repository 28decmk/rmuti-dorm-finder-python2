from fastapi import APIRouter

from app.services.vector_search_service import vector_search

router = APIRouter(
    prefix="/debug",
    tags=["Debug"]
)


@router.get("/vector-search")
async def debug_vector_search():

    results = await vector_search(
        "หอพักที่เหมาะกับการเรียน"
    )

    return results