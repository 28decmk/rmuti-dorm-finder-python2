import re

from services.search_constants import (
    FEATURE_SYNONYMS
)


def clean_query(query: str):

    query = re.sub(
        r"ไม่เกิน\s*\d+\s*บาท",
        "",
        query
    )

    print("BEFORE CLEAN =", query)

    for keywords in FEATURE_SYNONYMS.values():

        for keyword in keywords:

            if keyword in query:
                print("REMOVE =", keyword)

            query = query.replace(
                keyword,
                ""
            )

    return " ".join(
        query.split()
    )