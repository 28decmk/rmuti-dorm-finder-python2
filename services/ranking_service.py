from services.search_constants import (
    INTENT_KEYWORDS,
    INTENT_RULES
)


def detect_intent(query: str):

    for intent, keywords in INTENT_KEYWORDS.items():

        for keyword in keywords:

            if keyword in query:
                return intent

    return None

def calculate_price_score(dorm):

    return dorm["price_start"] / 5000

def calculate_security_score(dorm):

    score = 0

    if dorm.get("has_cctv"):
        score += 0.4

    if dorm.get("has_keycard"):
        score += 0.3

    if dorm.get("has_security_guard"):
        score += 0.3

    return score

def calculate_facility_score(dorm):

    facilities = [
        "has_air_conditioner",
        "has_wifi",
        "has_parking",
        "has_refrigerator",
        "has_furniture",
        "has_fitness",
        "has_elevator",
        "has_water_heater"
    ]

    count = 0

    for field in facilities:

        if dorm.get(field):
            count += 1

    return count / len(facilities)


def rerank_results(
    query: str,
    results: list
):

    intent = detect_intent(query)

    print("INTENT =", intent)

    if not intent:
        return results

    rule = INTENT_RULES.get(intent)

    if not rule:
        return results

    print("===== FINAL RANK =====")

    for dorm in results:

        score = 0

        semantic_score = (
            1 - dorm["distance"]
        )

        if "price_weight" in rule:

            price_score = (
                dorm["price_start"] / 5000
            )

            score += (
                price_score
                * rule["price_weight"]
            )

        final_score = (
            semantic_score * 0.7
            +
            score * 0.3
        )

        dorm["boost_score"] = score
        dorm["semantic_score"] = semantic_score
        dorm["final_score"] = final_score

        print(
            dorm["name"],
            "distance=",
            dorm["distance"],
            "semantic=",
            dorm["semantic_score"],
            "boost=",
            dorm["boost_score"],
            "final=",
            dorm["final_score"]
        )
        
    results.sort(
        key=lambda x: x["final_score"],
        reverse=True
    )

    return results