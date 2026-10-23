from fastapi import APIRouter
from services.hybrid_search_service import hybrid_search

router = APIRouter()


@router.get("/search/vector")
async def search_vector(q: str):

    print("SEARCH API CALLED")
    print("QUERY =", q)

    return await hybrid_search(q)