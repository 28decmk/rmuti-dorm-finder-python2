import asyncio
from services.vector_search_service import vector_search


async def main():

    queries = [
        "หอพักใกล้มหาวิทยาลัย",
        "หอพักราคาถูก",
        "หอพักเงียบ",
        "หอพักมีที่จอดรถ",
        "หอพักสำหรับนักศึกษา"
    ]

    for q in queries:

        print("\n================")
        print(q)

        rows = await vector_search(q)

        for row in rows:
            print(row)


asyncio.run(main())