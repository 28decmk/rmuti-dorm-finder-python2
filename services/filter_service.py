print("FILTER SERVICE LOADED")

import re

from services.search_constants import (
    FEATURE_SYNONYMS
)

def extract_filters(query: str):

    filters = {}

    price_match = re.search(
        r"ไม่เกิน\s*(\d+)",
        query
    )

    if price_match:
        filters["max_price"] = int(
            price_match.group(1)
        )

    query_lower = query.lower()

    for field, keywords in FEATURE_SYNONYMS.items():

        if any(
            keyword.lower() in query_lower
            for keyword in keywords
        ):
            filters[field] = True

    print("EXTRACT FILTERS:", filters)

    return filters