docker-compose up -d
FROM python:3.11-slim

WORKDIR /app

# ติดตั้ง dependencies ที่จำเป็นสำหรับระบบ (เผื่อบาง library ต้องใช้ compile)
RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# รัน uvicorn ในโหมด --reload เพื่อให้โค้ดอัปเดตอัตโนมัติเวลาเราเซฟไฟล์
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]