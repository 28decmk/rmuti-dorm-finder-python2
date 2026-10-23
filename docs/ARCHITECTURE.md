# บันทึกการวิเคราะห์ RMUTI Dorm Finder

## ขอบเขตและวิธีตรวจ

วิเคราะห์ซอร์ส Python, HTML, JavaScript, ORM models, dependencies และ Docker configuration ใน repository โดยอ่านคำแนะนำ Reverse Engineering ก่อนเริ่ม สกิลกำหนดให้งานวิเคราะห์ repository ที่มีซอร์สใช้เครื่องมืออ่านโค้ดตามปกติ จึงไม่ได้ใช้ decompiler หรืออ้างว่าได้รัน REA engine

ไม่มีการ import/run backend, seed ฐานข้อมูล, ส่งเมล, รัน load test หรือเรียก Gemini จริง ภาพ UI ใช้เทมเพลตและ JavaScript เดิมพร้อม API fixtures ภายใน browser renderer เท่านั้น ตรวจภาพด้วยสายตาและตรวจ JavaScript page errors ของ preview แล้ว

## ส่วนประกอบและหลักฐาน

| ส่วน | หลักฐานจากไฟล์ | หน้าที่ |
|---|---|---|
| Entrypoint / deployment | `Dockerfile`, `docker-compose.yml`, `app/main.py` | Uvicorn เปิด `app.main:app`; Compose มี backend, PostgreSQL/pgvector และ Redis |
| Public web | `templates/index.html`, `static/js/index.js`, `static/js/index_decorate.js` | แสดงหน้าค้นหา กรอง รายละเอียด ประเภทห้อง แบบฟอร์มจอง และ AI chat |
| Owner web | `templates/owner_dashboard.html`, `static/js/owner.js` | โปรไฟล์ จัดการหอ/ห้อง/รูป สถิติ และสถานะการจอง |
| Admin web | `templates/admin_dashboard.html` | ตรวจอนุมัติและจัดการเจ้าของหอ/ประกาศ; มี JavaScript inline |
| Data | `app/database.py`, `app/models/`, `app/schemas.py` | Async SQLAlchemy + Pydantic; PostgreSQL เป็นฐานข้อมูลหลัก |
| Auth | `app/auth.py`, dependencies ใน `app/main.py` | SHA-256(password + pepper) ก่อน bcrypt; JWT cookie และ role checks |
| Redis | `app/redis_conf.py`, `app/main.py` | Connection retry, cache, rate limiting, active token และ Pub/Sub |
| AI | `ai/ai_search_service.py`, `ai/ai_service.py` | Gemini intent, AI reranking และ Q&A จากข้อมูลหอ |
| Search services | `services/` | Query embedding, SQL vector similarity และ rule ranking; มี helper เก่าบางส่วน |
| Files / mail | `app/main.py`, `configmail.py` | อัปโหลดรูปลงดิสก์; Gmail SMTP port 587 ผ่าน FastAPI-Mail |
| Utilities | `seed_db*.py`, `reset_db.py`, `ai/generate_embeddings.py` | เตรียมบัญชี/ตาราง/embedding; ไม่ได้รันในการทำเอกสาร |
| Tests | `test_vector.py`, `test_rate_limit.py`, `load_test.js` | สคริปต์ทดสอบเดิม บางตัวอ้าง URL Codespaces เก่า; ไม่ใช่หลักฐานว่าผ่านการทดสอบปัจจุบัน |

`openai` อยู่ใน requirements แต่เส้นทาง AI หลักที่ตรวจพบเรียก Google Gemini จึงไม่ได้แสดง OpenAI เป็นบริการที่ระบบใช้งานจริงในแผนภาพ

## แบบจำลองข้อมูล

- `Admin`, `Owner`: บัญชีผู้ดูแลและเจ้าของหอ พร้อมสถานะการอนุมัติของ owner
- `Dormitory`: ข้อมูลประกาศ ราคาเริ่มต้น ห้องว่าง สิ่งอำนวยความสะดวก สถานะตรวจ และ embedding 768 มิติ
- `DormitoryDraft`: ข้อมูลแก้ไขรออนุมัติ เชื่อมกับหอแบบหนึ่งต่อหนึ่ง
- `DormImage`: ชื่อไฟล์รูปของหอ
- `RoomType`, `RoomTypeImage`: ประเภทห้อง ราคา ห้องว่าง และรูปแยกตามประเภท
- `DormBooking`: ชื่อ/เบอร์ติดต่อผู้จอง วันที่เข้าอยู่ ประเภทห้อง และสถานะ
- `DormViewLog`: ประวัติการเข้าชม เชื่อมกับหอ

ไม่มีโมเดลบัญชีนักศึกษาในชุดซอร์สนี้ การส่งคำขอจองใช้ข้อมูลผู้จองโดยตรง

## การไหลของงาน

**ประกาศ:** owner สมัคร → admin อนุมัติบัญชี → owner เพิ่มหอ → admin ตรวจประกาศ → เผยแพร่ เมื่อ owner แก้ไขหอที่อนุมัติแล้ว โค้ดรองรับ Draft และ `pending_update` ก่อนนำข้อมูลร่างทับข้อมูลหลักเมื่ออนุมัติ

**ค้นหา:** `/api/public/dorms` รองรับ keyword, amenities, ประเภท, ระยะทาง และ sort ส่วน `/api/public/search` ส่งคำค้นให้ Gemini ตีความ แล้วกรอง SQL หากเลือก relevance จะค้นเวกเตอร์ใน candidate IDs และจัดอันดับด้วย rules / Gemini อีกครั้ง

**Q&A:** endpoint chat อ่าน `dorm_detail:{id}` จาก Redis แล้วส่งข้อมูลหอและคำถามให้ Gemini หากไม่มี cache จะให้เปิด/รีเฟรชรายละเอียดหออีกครั้ง เป็น Q&A จากข้อมูลหอที่เลือก ไม่ใช่ระบบสนทนาที่มีฐานความรู้แยกต่างหาก

**จอง:** public API สร้าง booking สถานะ pending และลดจำนวนห้องว่างทันที จากนั้น invalidate cache และ publish แจ้ง owner เจ้าของเปลี่ยนสถานะได้ โค้ดมีการคืนจำนวนห้องเมื่อเปลี่ยนจาก pending/confirmed ไป cancelled/rejected ไม่มี payment integration ที่พบ

**แจ้งเตือน:** routes publish เหตุการณ์เข้า `admin_notifications` / `owner_updates` → WebSocket handlers subscribe Redis → ส่ง JSON ไปหน้า dashboard เป็นการทำงานภายใน FastAPI ไม่ได้มี queue worker แยก

## ข้อจำกัดที่พบจากการอ่านโค้ด

รายการนี้เป็น static findings ยังไม่ได้ยืนยันด้วยระบบที่รันจริง และไม่ได้แก้ไขในการจัดทำเอกสาร

1. `ai_rerank_results()` คืน list ของ dorm objects/dicts แต่ `search_dorms()` นำผลไปใช้เสมือน list ของ IDs (`candidate_map[id]` / `if id in candidate_map`) เส้นทาง relevance จึงมี return-type mismatch ที่อาจทำให้เกิด error
2. `/search/vector` ถูก include จริง แต่ `hybrid_search()` เรียก `vector_search()` โดยไม่ส่ง `candidate_ids` ซึ่งเป็น required argument ใน implementation ปัจจุบัน เช่นเดียวกับ `test_vector.py` ส่วน debug router ยังไม่ถูก include และมี import path เก่า
3. โมเดลใช้ `Vector(768)` แต่เส้นทางสร้าง embedding ไม่ได้ระบุ output dimension จึงต้องตรวจขนาดผลจริงก่อนใช้งาน `ai/generate_embeddings.py` ยังเลือก SQL fields ไม่ครบกับ attributes ที่อ่าน และใช้ SDK interface ต่างจากโมดูลหลัก
4. `/api/public/dorms` มีคำสั่งเขียน cache อยู่หลัง `return dorms` ซึ่งไปไม่ถึง ส่วน AI search สร้างและเขียน cache key แต่ไม่พบการอ่าน key นั้นใน endpoint ดังกล่าว จึงไม่อ้างว่า cache ครอบคลุมการค้นหาทั้งหมด
5. มี helper เก็บ active token ใน Redis แต่ dependency auth หลักตรวจ JWT cookie/role โดยไม่ได้เรียก `is_token_active()` จึงไม่อ้างว่ามีการตรวจ session revocation ครบทุก request
6. WebSocket handlers accept และ subscribe โดยไม่พบการตรวจ JWT/role ในตัว handler; การแยกข้อความบางส่วนทำฝั่ง client จึงไม่ควรตีความแผนภาพว่าเป็นการยืนยันการป้องกันข้อมูลครบถ้วน
7. Startup เรียก `Base.metadata.create_all()` แต่ไม่พบ migration workflow หรือคำสั่งเปิด extension `vector` ใน Compose; ต้องเตรียม pgvector extension ก่อนสร้างตารางเวกเตอร์ในฐานข้อมูลใหม่ โค้ดล้าง view logs เรียก `scalars()` บนผล DELETE และไม่พบ commit ใน helper นั้น จึงไม่ยืนยันว่าการล้าง log สำเร็จ
8. สคริปต์ seed เก่ามี field ที่ไม่ตรงโมเดลปัจจุบัน และสคริปต์ embedding มี debug print ของค่าลับ จึงไม่ได้ใช้สคริปต์เหล่านี้ในการสร้างภาพหรือเอกสาร และไม่ได้เผยแพร่ค่าจาก `.env`

## ไฟล์ภาพและ Canva

- แผนภาพต้นฉบับ: `design/system-architecture.html` และ `design/user-flow.html`
- ภาพอ่านชัดสำหรับ GitHub: `assets/system-architecture.png` และ `assets/user-flow.png`
- [Canva design](https://www.canva.com/design/DAHY3t3zQZI/view): หน้า 1 เป็นต้นฉบับนำเข้า หน้า 2 ชื่อ **System Architecture — Whiteboard** เป็นหน้า Whiteboard พร้อมองค์ประกอบแก้ไขได้
- `assets/canva-whiteboard.png`: ภาพหลักฐานหน้า Whiteboard ใน Canva
- `assets/demo-*.png`: ภาพสาธิตจากเทมเพลตเดิมกับข้อมูลสมมติ รวม 11 ภาพ ไม่ใช่ผลทดสอบ backend
- `design/logo-sources.json`: ข้อมูลโลโก้ที่ดึงจาก SVGL API

เพิ่มเฉพาะเอกสารและ assets ไม่มีการแก้ application source หรือ configuration เดิม
