print("HYBRID SEARCH VERSION 999")

from services.vector_search_service import vector_search
from services.filter_service import extract_filters
from services.ranking_service import (
    rerank_results
)

import re

def clean_query(query: str):

    query = re.sub(
        r"ไม่เกิน\s*\d+\s*บาท",
        "",
        query
    )

    query = query.replace("แอร์", "")
    query = query.replace("wifi", "")
    query = query.replace("WiFi", "")
    query = query.replace("ที่จอดรถ", "")

    return query.strip()

async def hybrid_search(query: str):

    filters = extract_filters(query)

    print("FILTERS =", filters)

    semantic_query = clean_query(query)

    print("ORIGINAL =", query)
    print("SEMANTIC =", semantic_query)

    print("FILTER SERVICE =", extract_filters.__module__)

    results = await vector_search(
        query=semantic_query,
        filters=filters
    )

    results = rerank_results(
        query=query,
        results=results
    )

    return results