from fastapi import FastAPI, Depends, Request, HTTPException, status, Response, Cookie, WebSocket, WebSocketDisconnect, UploadFile, File, Form, APIRouter, BackgroundTasks, Query
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse  # แยกมาไว้บรรทัดนี้
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select # เพิ่มตัวนี้
from sqlalchemy import text
import redis.asyncio as redis
from .database import get_db, engine, AsyncSessionLocal, Base
from .redis_conf import get_redis, REDIS_URL, get_redis_client
from .models import Base, Admin, Owner, Dormitory, DormImage
from .schemas import OwnerRegisterRequest # นำเข้า Schema
import os
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from contextlib import asynccontextmanager # ใช้ตัวนี้แทนการ import lifespan แยกถ้าไฟล์นั้นมีปัญหา
import asyncio
from .auth import get_password_hash, verify_password, create_access_token, store_token_in_redis, SECRET_KEY, ALGORITHM
from .schemas import LoginRequest
from jose import jwt, JWTError
from starlette.responses import RedirectResponse
import json
from app import schemas, models
import uuid
from typing import List, Optional
from sqlalchemy import select, func, update, delete, or_, and_, desc, asc
from sqlalchemy.orm import selectinload, Session, joinedload
from fastapi.encoders import jsonable_encoder
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from app.models.dormitory import Dormitory, DormViewLog
from pydantic import BaseModel
from app.schemas import ViewRecordRequest
from configmail import conf  # <--- Import มาจากไฟล์ที่เราสร้าง
from fastapi_mail import FastMail, MessageSchema
import re


# กำหนด Path สำหรับเก็บรูปภาพ
UPLOAD_DIR = "static/uploads/dorms"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 1. กำหนด Path (เอาไว้ด้านบนสุด)
BASE_DIR = os.path.dirname(os.path.abspath(__file__)) 
STATIC_DIR = os.path.join(os.path.dirname(BASE_DIR), "static")

router = APIRouter()


async def my_limit_callback(request, response, pexpire):
    """ฟังก์ชันที่จะรันเมื่อ User กดเกินกำหนด"""
    expire = pexpire // 1000  # แปลงมิลลิวินาทีเป็นวินาที
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"⚠️ คุณกดบ่อยเกินไป ระบบป้องกันการสแปมทำงาน กรุณารออีก {expire} วินาทีค่อยลองใหม่นะ"
    )


# --- ฟังก์ชันจัดการขยะ: ลบ Log การเข้าชมที่เก่าเกิน 90 วัน ---
async def cleanup_old_view_logs(db: AsyncSession):
    try:
        # 1. คำนวณวันที่ย้อนหลังไป 90 วัน
        threshold_date = datetime.utcnow() - timedelta(days=90)
        
        # 2. สร้างคำสั่งลบ Log ที่มี viewed_at น้อยกว่า threshold_date
        stmt = delete(models.DormViewLog).where(models.DormViewLog.viewed_at < threshold_date)
        
        # 3. ประมวลผลคำสั่ง
        result = await db.execute(stmt)
        await db.commit()
        
        if result.rowcount > 0:
            print(f"🧹 [Cleanup] ลบ Log เก่าเรียบร้อยแล้ว ทั้งหมด {result.rowcount} รายการ")
        else:
            print("🧹 [Cleanup] ไม่พบ Log ที่เก่าเกิน 90 วัน")
            
    except Exception as e:
        await db.rollback()
        print(f"🚨 [Cleanup Error] เกิดข้อผิดพลาดขณะล้างข้อมูล: {str(e)}")

# 2. นิยาม Lifespan Manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- [ส่วน Startup: รันตอนเปิดเครื่อง] ---
    print("🚀 Application starting up...")
    
    try:
        # 1. จัดการ Database (สร้างตารางถ้าหายไป)
        print("📡 Connecting to Database...")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("✅ Database tables verified/created.")

        # --- 🚨 ส่วนที่เพิ่มใหม่: ล้าง Log ยอดวิวที่เก่าเกิน 90 วัน 🚨 ---
        print("🧹 Cleaning up old view logs...")
        async with AsyncSessionLocal() as db:  # <--- เปลี่ยนเป็น AsyncSessionLocal
            await cleanup_old_view_logs(db)
        # -------------------------------------------------------

        # 2. จัดการ Redis & Limiter (ใช้ Retry Logic จาก get_redis_client)
        print("🔌 Connecting to Redis...")
        redis_instance = await get_redis_client(decode_responses=True)
        
        await FastAPILimiter.init(
            redis_instance, 
            http_callback=my_limit_callback
        )
        
        app.state.limiter_redis = redis_instance
        print("✅ Redis and FastAPILimiter connected successfully.")

        yield  # <--- จุดที่แอปเริ่มทำงานจริง รับคนเข้าเว็บ

    except Exception as e:
        print(f"❌ Critical Startup Error: {e}")
        # ถ้ามีอะไรพังในจุดนี้ แอปจะปิดตัวทันที (Fail-safe)
        raise e 

    finally:
        # --- [ส่วน Shutdown: รันตอนปิดเครื่อง] ---
        redis_instance = getattr(app.state, "limiter_redis", None)
        if redis_instance:
            await redis_instance.close()
            print("🛑 Redis connection closed gracefully.")
        print("👋 Application shutdown complete.")

# ---------------------------------------------------------
# 3. ประกาศแอปแค่ "ครั้งเดียว" (สำคัญมาก!)
# ---------------------------------------------------------
app = FastAPI(
    title="RMUTI Dorm Finder",
    lifespan=lifespan
)


@app.exception_handler(HTTPException)
async def auth_exception_handler(request: Request, exc: HTTPException):
    # ดักจับ Error 307 ที่เราตั้งใจส่งมาจากด่านตรวจ
    if exc.status_code == 307:
        response = RedirectResponse(url=f"/?error={exc.detail}")
        # ลบคุกกี้ทิ้งเพื่อความปลอดภัย
        response.delete_cookie("access_token")
        return response
    
    # สำหรับ Error อื่นๆ ให้แสดงผลตามปกติ
    # สำหรับ Error อื่นๆ ให้คืนค่าเป็น JSON หรือใช้ Handler มาตรฐานของ Starlette
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    # สั่งให้ Browser ห้ามเก็บ Cache สำหรับหน้าที่มีความสำคัญ
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory="templates")


@app.websocket("/ws/admin/notifications")
async def admin_notification_socket(websocket: WebSocket, rd = Depends(get_redis)):
    await websocket.accept()
    pubsub = rd.pubsub()
    await pubsub.subscribe("admin_notifications")
    
    try:
        while True:
            # ลบ ignore_subscribe_init ออกไปเลยครับ
            message = await pubsub.get_message() 
            
            # เช็คว่าเป็นข้อความใหม่จริงๆ (ไม่ใช่ข้อความยืนยันการ subscribe)
            if message and message['type'] == 'message':
                data = message['data']
                if isinstance(data, bytes):
                    data = data.decode('utf-8')
                await websocket.send_text(data)
                
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        print("Admin disconnected")
    except Exception as e:
        print(f"WebSocket Error: {e}")
    finally:
        await pubsub.unsubscribe("admin_notifications")


# --- WebSocket สำหรับฝั่ง Owner ---
@app.websocket("/ws/owner/notifications")
async def owner_notification_socket(websocket: WebSocket, rd = Depends(get_redis)):
    await websocket.accept()
    pubsub = rd.pubsub()
    
    # 1. Subscribe ช่องที่ต้องการ
    await pubsub.subscribe("owner_updates", "admin_notifications")
    
    try:
        while True:
            # ✅ จุดสำคัญ: ใส่ timeout=1.0 เพื่อให้มัน "หยุดรอ" ข้อความ 1 วินาที
            # ถ้าไม่มีข้อความในช่วง 1 วิ มันจะคืน None แล้วค่อยเริ่มวนลูปใหม่ (ประหยัด CPU มาก)
            message = await pubsub.get_message(timeout=1.0) 
            
            if message and message['type'] == 'message':
                data = message['data']
                if isinstance(data, bytes):
                    data = data.decode('utf-8')
                
                # ส่งข้อมูลไปที่หน้าจอ
                print(f"🚀 Sending to Owner: {data}")
                await websocket.send_text(data)

            # เช็คว่า Browser ยังเชื่อมต่ออยู่ไหม (Heartbeat สั้นๆ)
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=0.01)
            except (asyncio.TimeoutError, RuntimeError):
                pass

    except WebSocketDisconnect:
        print("Owner disconnected normally")
    except Exception as e:
        print(f"Owner WebSocket Error: {e}")
    finally:
        # ล้างการเชื่อมต่อให้สะอาด
        try:
            await pubsub.unsubscribe()
        except:
            pass


# ตัวอย่างฟังก์ชันส่งเมล
async def send_status_email(email_to: str, subject: str, body: str):
    message = MessageSchema(
        subject=subject,
        recipients=[email_to],
        body=body,
        subtype="html"
    )
    fm = FastMail(conf)  # ใช้ conf ที่ import มา
    await fm.send_message(message)



# หน้าแรก
@app.get("/")
async def home(request: Request, access_token: str = Cookie(None)):
    # ถ้ามีคุกกี้อยู่แล้ว ลองเช็คดูว่ายังใช้งานได้ไหม
    if access_token:
        try:
            token = access_token.replace("Bearer ", "")
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            role = payload.get("role")
            
            # ถ้า Token ยังดีอยู่ ให้ Redirect ไปตาม Role ทันที ไม่ต้องให้เห็นหน้า Login
            if role == "admin":
                return RedirectResponse(url="/admin/dashboard")
            elif role == "owner":
                return RedirectResponse(url="/owner/dashboard")
        except JWTError:
            # ถ้า Token ปลอมหรือหมดอายุ ให้ปล่อยให้เข้าหน้า Login ปกติ (แต่ลบคุกกี้เน่าทิ้ง)
            response = templates.TemplateResponse("index.html", {"request": request, "title": "หน้าแรก"})
            response.delete_cookie("access_token")
            return response

    return templates.TemplateResponse("index.html", {"request": request, "title": "หน้าแรก"})


# หน้า ลงทะเบียน owner
@app.post("/api/auth/register-owner",dependencies=[Depends(RateLimiter(times=5, seconds=60))]) # 👈 จำกัด 5 ครั้งต่อนาที
async def register_owner(
    user_data: OwnerRegisterRequest, 
    db: AsyncSession = Depends(get_db),
    rd = Depends(get_redis)  # <--- ต้องเพิ่มบรรทัดนี้ครับ!
):
    # 1. ตรวจสอบว่า Username หรือ Email มีในระบบแล้วหรือยัง
    query = select(Owner).where(
        (Owner.username == user_data.username) | (Owner.email == user_data.email)
    )
    result = await db.execute(query)
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=400, 
            detail="ชื่อผู้ใช้งานหรืออีเมลนี้ถูกใช้งานไปแล้ว"
        )

    # 2. Hash Password
    hashed = get_password_hash(user_data.password)

    # 3. สร้าง Instance ของ Owner ใหม่
    new_owner = Owner(
        username=user_data.username,
        email=user_data.email,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        phone=user_data.phone,
        dorm_name=user_data.dorm_name, # มั่นใจว่าใน Schema มี field นี้
        hashed_password=hashed,
        is_approved=False
    )

    # 4. บันทึกลง Database
    try:
        db.add(new_owner)
        await db.commit()
        await db.refresh(new_owner)
        
        # --- ส่งข้อมูลไปยัง Redis หลังบันทึกสำเร็จ ---
        import json
        notification_data = {
            "event": "new_registration",
            "data": {
                "id": new_owner.id,
                "username": new_owner.username,
                "dorm_name": new_owner.dorm_name,
                "full_name": f"{new_owner.first_name} {new_owner.last_name}"
            }
        }
        await rd.publish("admin_notifications", json.dumps(notification_data))
        # ----------------------------------------

    except Exception as e:
        await db.rollback()
        print(f"Error: {e}") # ดู error ใน log
        raise HTTPException(status_code=500, detail="เกิดข้อผิดพลาดในการบันทึกข้อมูล")

    return {
        "status": "success", 
        "message": "ลงทะเบียนสำเร็จ! กรุณารอผู้ดูแลระบบอนุมัติบัญชีของคุณ"
    }

# หน้า login 
# หน้า login (เวอร์ชันเพิ่ม Error Handling เพื่อหาจุดบกพร่อง)
@app.post("/api/auth/login")
async def login(
    login_data: LoginRequest, 
    response: Response, 
    db: AsyncSession = Depends(get_db), 
    rd = Depends(get_redis)
):
    try:
        # 1. ค้นหาในตาราง Admin
        result = await db.execute(select(Admin).where(
            (Admin.username == login_data.identity) | (Admin.email == login_data.identity)
        ))
        user = result.scalar_one_or_none()
        role = "admin"

        # 2. ถ้าไม่เจอใน Admin ให้หาใน Owner
        if not user:
            result = await db.execute(select(Owner).where(
                (Owner.username == login_data.identity) | (Owner.email == login_data.identity)
            ))
            user = result.scalar_one_or_none()
            role = "owner"

        # 3. ตรวจสอบรหัสผ่าน
        if not user or not verify_password(login_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
            )
        
        # --- ตรวจสอบการอนุมัติสำหรับ Owner ---
        if role == "owner":
            # ใช้ getattr เพื่อป้องกันกรณีหา attribute ไม่เจอแล้ว Error 500
            is_approved = getattr(user, 'is_approved', None)
            if is_approved is False:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="บัญชีของคุณอยู่ระหว่างการรออนุมัติจากเจ้าหน้าที่"
                )
        # --------------------------------------------------

        # 4. สร้าง JWT Token
        access_token = create_access_token(
            data={"sub": user.username, "role": role, "user_id": user.id}
        )

        # 5. บันทึกลง Redis
        await store_token_in_redis(rd, user.id, role, access_token)

        # 6. ฝัง Token ลงใน Cookie
        response.set_cookie(
            key="access_token",
            value=f"Bearer {access_token}",
            httponly=True,
            max_age=1800,
            expires=1800,
            samesite="lax",
            secure=False,
        )

        return {
            "status": "success",
            "role": role
        }

    except HTTPException as http_exc:
        # ถ้าเป็น Error ที่เราตั้งใจส่ง (401, 403) ให้ปล่อยไปตามปกติ
        raise http_exc
    except Exception as e:
        # ถ้าเป็น Error อื่นๆ (500) ให้พ่นชื่อ Error ออกมาดู
        print(f"❌ LOGIN DEBUG ERROR: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Internal Error: {str(e)}"
        )



# API ดึงข้อมูลหอพักหน้า index
@app.get("/api/public/dorms", response_model=List[schemas.DormitoryResponse])
async def get_public_dorms(
    t: Optional[str] = None,
    search: Optional[str] = None,
    sort: Optional[str] = None,
    dorm_type: Optional[str] = None,
    amenities: Optional[str] = None,
    max_distance: Optional[float] = None,
    db: AsyncSession = Depends(get_db), 
    rd = Depends(get_redis)
):
    cache_key = "public_verified_dorms"
    is_filtering = any([search, sort, dorm_type, amenities, max_distance])

    # 1. Redis Cache
    if not t and not is_filtering:
        try:
            cached_data = await rd.get(cache_key)
            if cached_data:
                return json.loads(cached_data)
        except Exception as e:
            print(f"Redis Error: {e}")

    await db.execute(text("SET TRANSACTION ISOLATION LEVEL READ COMMITTED"))
    
    # --- 2. สร้าง Query (ต้องมีส่วนนี้ติ๊กเลือกถึงจะทำงาน) ---
    query = select(models.Dormitory).where(models.Dormitory.is_verified == True)

    # กรองตามคำค้นหา
    if search:
        search_query = f"%{search.strip()}%"
        query = query.filter(or_(
            models.Dormitory.name.ilike(search_query),
            models.Dormitory.description.ilike(search_query),
            models.Dormitory.address.ilike(search_query)
        ))

    # กรองตามประเภทหอพัก
    if dorm_type and dorm_type != "all":
        query = query.filter(models.Dormitory.dorm_type == dorm_type)

    # กรองตามสิ่งอำนวยความสะดวก (Checkboxes) - **จุดที่ทำให้ติ๊กเลือกทำงาน**
    if amenities:
        for am in amenities.split(','):
            attr = am.strip()
            if hasattr(models.Dormitory, attr):
                # กรองเฉพาะห้องที่เป็น True
                query = query.filter(getattr(models.Dormitory, attr) == True)

    # 3. จัดลำดับ (Sort)
    if sort == "price_asc":
        query = query.order_by(models.Dormitory.price_start.asc())
    elif sort == "price_desc":
        query = query.order_by(models.Dormitory.price_start.desc())
    elif sort == "views":
        query = query.order_by(models.Dormitory.total_views.desc())
    elif sort == "vacancy":
        query = query.order_by(models.Dormitory.vacancy_count.desc())
    else:
        query = query.order_by(models.Dormitory.created_at.desc())

    # 4. Execute Query
    result = await db.execute(query.options(selectinload(models.Dormitory.images)))
    dorms = result.scalars().all()

    # 5. กรองระยะทางด้วย Python (เฉพาะถ้ามีการส่ง max_distance มา)
    if max_distance is not None:
        filtered_results = []
        for d in dorms:
            if not d.distance_to_rmuti:
                continue
            
            dist_text = d.distance_to_rmuti.lower()
            try:
                numbers = re.findall(r"[-+]?\d*\.\d+|\d+", dist_text)
                if not numbers: continue
                
                val = float(numbers[0])
                if "กม" in dist_text or "km" in dist_text:
                    val *= 1000
                
                if val <= max_distance:
                    filtered_results.append(d)
            except:
                continue
        dorms = filtered_results

    # 6. ส่งข้อมูลกลับ
    safe_data = jsonable_encoder(dorms)

    if not is_filtering:
        try:
            await rd.setex(cache_key, 300, json.dumps(safe_data))
        except:
            pass

    return safe_data



# API สำหรับดึงรายละเอียดหอพักรายตัว (Public)
@app.get("/api/public/dorms/{dorm_id}")
async def get_public_dorm_detail(dorm_id: int, db: AsyncSession = Depends(get_db), rd = Depends(get_redis)):
    cache_key = f"dorm_detail:{dorm_id}"
    
    # 1. ลองดึงจาก Cache
    cached_data = await rd.get(cache_key)
    if cached_data:
        return json.loads(cached_data)
    
    # 2. ถ้าไม่มีใน Cache ให้ดึงจาก DB
    # เพิ่มบรรทัดนี้เพื่อป้องกัน SQLAlchemy คืนค่าเก่าใน session
    await db.execute(text("COMMIT"))

    # 2. ถ้าไม่มีใน Cache ให้ดึงจาก DB
    result = await db.execute(
        select(models.Dormitory)
        .where(models.Dormitory.id == dorm_id, models.Dormitory.is_verified == True)
        .options(selectinload(models.Dormitory.images))
    )
    dorm = result.scalar_one_or_none()

    if not dorm:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลหอพัก")

    # แปลงเป็น dict เพื่อเก็บเข้า Redis
    dorm_data = {
        "id": dorm.id,
        "name": dorm.name,
        "total_views": dorm.total_views, # 👈 เพิ่มบรรทัดนี้เข้าไป!
        "description": dorm.description,
        "address": dorm.address,
        "price_start": dorm.price_start,
        "distance_to_rmuti": dorm.distance_to_rmuti,
        "vacancy_count": dorm.vacancy_count,
        "contact_number": dorm.contact_number,
        "line_id": dorm.line_id,
        "google_map_link": dorm.google_map_link,
        "dorm_type": dorm.dorm_type,
        "room_type": dorm.room_type,
        # Amenities
        "has_wifi": dorm.has_wifi, "has_air_conditioner": dorm.has_air_conditioner,
        "has_parking": dorm.has_parking, "has_laundry": dorm.has_laundry,
        "is_pet_friendly": dorm.is_pet_friendly, "has_water_heater": dorm.has_water_heater,
        "has_elevator": dorm.has_elevator, "has_furniture": dorm.has_furniture,
        "has_refrigerator": dorm.has_refrigerator, "has_keycard": dorm.has_keycard,
        "has_cctv": dorm.has_cctv, "has_security_guard": dorm.has_security_guard,
        "has_fitness": dorm.has_fitness, "has_drinking_water": dorm.has_drinking_water,
        "images": [{"filename": img.filename} for img in dorm.images]
    }

    # 3. เก็บเข้า Cache (1 ชั่วโมง)
    await rd.setex(cache_key, 3600, json.dumps(dorm_data))
    return dorm_data


# --- API สำหรับบันทึกยอดผู้เข้าชม (View Counter) ---
@app.post("/api/public/dorms/{dorm_id}/view")
async def record_dorm_view(
    dorm_id: int, 
    data: ViewRecordRequest, 
    request: Request,
    background_tasks: BackgroundTasks, # 👈 2. รับ background_tasks เข้ามา
    db: AsyncSession = Depends(get_db),
    rd = Depends(get_redis)
):
    client_ip = request.client.host
    
    # 👈 3. เปลี่ยนจาก await เป็นการสั่งงานเบื้องหลัง
    # ระบบจะคืนค่า {"status": "success"} ให้ User ทันที แล้วค่อยไปคุยกับ DB ทีหลัง
    background_tasks.add_task(sync_record_view, db, rd, dorm_id, data.visitor_id, client_ip)
    
    return {"status": "success"}


# --- ฟังก์ชันทำงานเบื้องหลัง (Helper Function) ---
async def sync_record_view(db: AsyncSession, rd, dorm_id: int, visitor_id: str, ip: str):
    try:
        # --- 1. หา Owner ID (ยิง Query สั้นๆ) ---
        res = await db.execute(
            select(models.Dormitory.owner_id).where(models.Dormitory.id == dorm_id)
        )
        owner_id = res.scalar_one_or_none()
        
        if not owner_id:
            return

        # --- 2. พยายามสร้าง Log (กันปั๊มยอดวิว) ---
        try:
            new_log = models.DormViewLog(dorm_id=dorm_id, visitor_id=visitor_id, ip_address=ip)
            db.add(new_log)
            await db.flush() 
        except Exception:
            await db.rollback()
            # print(f"ℹ️ Skip duplicate view")
            return 

        # --- 3. อัปเดตยอดวิวรวมใน DB ---
        stmt = (
            update(models.Dormitory)
            .where(models.Dormitory.id == dorm_id)
            .values(total_views=models.Dormitory.total_views + 1)
        )
        await db.execute(stmt)
        await db.commit()

        # --- 4. การจัดการ Cache แบบ "ฉลาดขึ้น" ---
        
        # ✅ ลบ Cache เฉพาะตัวหอนั้นๆ (เพราะคนดูหอนั้นต้องการเห็นยอดวิวอัปเดตทันที)
        await rd.delete(f"dorm_detail:{dorm_id}") 
        
        # ✅ ลบสถิติเจ้าของหอ (เพื่อให้เขารู้ว่าคนเข้าเยอะแค่ไหน)
        await rd.delete(f"owner_stats:{owner_id}") 

        # ❌ เลิกใช้: await rd.delete("public_verified_dorms") 
        # ปล่อยให้หน้าแรกมันหมดอายุเองตาม TTL (ที่ตั้งไว้ 300 วิ) 
        # หรือถ้าอยากให้อัปเดต แต่ไม่ลบทิ้ง ให้ใช้ระบบ "Lazy Update" แทน

        # --- 5. Pub/Sub (คงไว้เพราะกินทรัพยากรน้อยมาก) ---
        notification = {
            "event": "view_updated",
            "owner_id": owner_id,
            "dorm_id": dorm_id,
        }
        await rd.publish("owner_updates", json.dumps(notification))

    except Exception as e:
        await db.rollback()
        print(f"🚨 Error: {str(e)}")


# API ค้นหาหอพัก
@app.get("/api/public/search", response_model=List[schemas.DormitoryResponse])
async def search_dorms(
    q: str = "", 
    db: AsyncSession = Depends(get_db),
    rd = Depends(get_redis)
):
    if not q or len(q.strip()) < 2:
        return []

    search_query = q.strip()
    cache_key = f"search_results:{search_query}"

    # 1. ลองดึงจาก Redis ก่อน
    cached = await rd.get(cache_key)
    if cached:
        return json.loads(cached)

    # 2. ถ้าไม่มีใน Cache ให้ค้นใน DB
    # ค้นจากชื่อ (name) หรือ รายละเอียด (description) หรือ ที่อยู่ (address)
    result = await db.execute(
        select(models.Dormitory)
        .where(
            models.Dormitory.is_verified == True,
            or_(
                models.Dormitory.name.ilike(f"%{search_query}%"),
                models.Dormitory.description.ilike(f"%{search_query}%"),
                models.Dormitory.address.ilike(f"%{search_query}%")
            )
        )
        .options(selectinload(models.Dormitory.images))
        .limit(20) # จำกัดผลลัพธ์เพื่อความเร็ว
    )
    dorms = result.scalars().all()
    safe_data = jsonable_encoder(dorms)

    # 3. เก็บลง Redis (ตั้งเวลา 5-10 นาทีก็พอสำหรับการค้นหา)
    await rd.setex(cache_key, 600, json.dumps(safe_data))

    return safe_data


# API สำหรับนักศึกษาทำการจอง
@app.post("/api/bookings", response_model=schemas.BookingResponse)
async def create_booking(
    booking_in: schemas.BookingCreate, 
    db: AsyncSession = Depends(get_db),
    rd = Depends(get_redis)
):
    # 1. ตรวจสอบก่อนว่าหอพักนี้มีจริงไหม
    result = await db.execute(select(models.Dormitory).where(models.Dormitory.id == booking_in.dorm_id))
    dorm = result.scalar_one_or_none()
    
    if not dorm:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลหอพักที่ต้องการจอง")

    # 2. บันทึกลงฐานข้อมูล
    new_booking = models.DormBooking(
        dorm_id=booking_in.dorm_id,
        guest_name=booking_in.guest_name,
        guest_phone=booking_in.guest_phone,
        check_in_date=booking_in.check_in_date,
        remark=booking_in.remark,
        status="pending" # สถานะเริ่มต้น
    )
    
    db.add(new_booking)
    
    try:
        await db.commit()
        await db.refresh(new_booking)

        # 3. ส่งการแจ้งเตือนผ่าน Redis (แจ้งไปที่ Owner ของหอนี้)
        try:
            booking_notification = {
                "event": "new_booking_received",
                "owner_id": dorm.owner_id, # แจ้งเฉพาะเจ้าของหอนี้
                "data": {
                    "booking_id": new_booking.id,
                    "dorm_name": dorm.name,
                    "guest_name": new_booking.guest_name,
                    "guest_phone": new_booking.guest_phone,
                    "message": f"มีรายการจองใหม่จากคุณ {new_booking.guest_name} ที่หอ {dorm.name}"
                }
            }
            # ส่งไปที่ channel เดียวกับที่ owner ฟังอยู่
            await rd.publish("owner_updates", json.dumps(booking_notification))
        except Exception as redis_err:
            print(f"Redis Notify Error: {redis_err}") # ล้มเหลวไม่เป็นไร เพราะ DB บันทึกไปแล้ว

        return new_booking

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"ไม่สามารถบันทึกการจองได้: {str(e)}")





# ฟังก์ชันกลางสำหรับตรวจสอบและดึงข้อมูลจาก Token
async def get_current_user_from_cookie(access_token: str = Cookie(None)):
    if not access_token:
        # ถ้าไม่มีคุกกี้ ให้โยน Exception ออกไป (เดี๋ยวเราจะดักจับไป Redirect)
        raise HTTPException(status_code=307, detail="Not authenticated")
    
    try:
        token = access_token.replace("Bearer ", "")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload  # ส่งข้อมูลใน Token (username, role, id) กลับไป
    except JWTError:
        raise HTTPException(status_code=307, detail="Invalid session")

# ด่านตรวจสำหรับ Admin
async def admin_only(payload: dict = Depends(get_current_user_from_cookie)):
    if payload.get("role") != "admin":
        raise HTTPException(status_code=307, detail="Admin access required")
    return payload

# ด่านตรวจสำหรับ Owner
async def owner_only(payload: dict = Depends(get_current_user_from_cookie)):
    # อนุญาตให้ทั้ง owner และ admin เข้าถึงได้ (กรณีแอดมินอยากตรวจงาน)
    if payload.get("role") not in ["owner", "admin"]:
        raise HTTPException(status_code=307, detail="Owner access required")
    return payload



# หน้าแอดมิน
@app.get("/admin/dashboard", response_class=HTMLResponse)
async def admin_dashboard(
    request: Request, 
    payload: dict = Depends(admin_only) # เรียกใช้ด่านตรวจตรงนี้
):
    # ถ้าโค้ดรันมาถึงตรงนี้ได้ แปลว่าผ่านการตรวจสอบ JWT และ Role เรียบร้อยแล้ว
    # คุณสามารถดึงชื่อแอดมินมาใช้ได้จาก payload เช่น payload.get("sub")
    context = {
        "request": request,
        "admin_user": payload.get("sub") 
    }
    return templates.TemplateResponse("admin_dashboard.html", context)


# API สำหรับดึงรายชื่อ Owner ที่รออนุมัติ
@app.get("/api/admin/pending-owners")
async def get_pending_owners(
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(admin_only) # เฉพาะแadminเท่านั้น
):
    result = await db.execute(select(Owner).where(Owner.is_approved == False))
    owners = result.scalars().all()
    return owners

# API สำหรับอนุมัติ Owner
@app.post("/api/admin/approve-owner/{owner_id}")
async def approve_owner(
    owner_id: int,
    background_tasks: BackgroundTasks, # เพิ่มตรงนี้
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(admin_only),
    rd = Depends(get_redis)
):
    result = await db.execute(select(Owner).where(Owner.id == owner_id))
    owner = result.scalar_one_or_none()
    
    if not owner:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลผู้ใช้งาน")
    
    owner.is_approved = True
    await db.commit()

    # --- 1. ส่งอีเมลแจ้งเตือน (Background) ---
    email_content = f"""
    <h2>ยินดีด้วย! บัญชีของคุณได้รับการอนุมัติแล้ว</h2>
    <p>สวัสดีคุณ {owner.first_name},</p>
    <p>ขณะนี้คุณสามารถเข้าสู่ระบบเพื่อจัดการหอพัก <b>{owner.dorm_name}</b> ของคุณได้แล้ว</p>
    <br>
    <p>ทีมงาน RMUTI Dorm</p>
    """
    background_tasks.add_task(send_status_email, owner.email, "แจ้งผลการอนุมัติบัญชีเจ้าของหอพัก", email_content)

    # --- 2. ล้าง Cache Redis ---
    try:
        await rd.delete("admin:all_owners") 
    except Exception as e:
        print(f"Redis Cache Error: {e}")

    # --- 3. WebSocket Notification ---
    try:
        notification_data = {
            "event": "owner_approved", 
            "data": {"id": owner.id, "message": f"อนุมัติ {owner.username} แล้ว"}
        }
        await rd.publish("admin_notifications", json.dumps(notification_data))
    except Exception as e:
        print(f"Redis Publish Error: {e}")
    
    return {"status": "success", "message": "อนุมัติและส่งเมลแจ้งเตือนเรียบร้อย"}

# ลบคำขอ
@app.delete("/api/admin/reject-owner/{owner_id}")
async def reject_owner(
    owner_id: int, 
    remark: str = Query(...), # รับหมายเหตุจาก Frontend
    background_tasks: BackgroundTasks = BackgroundTasks(), # เพิ่มตรงนี้
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(admin_only)
):
    result = await db.execute(select(Owner).where(Owner.id == owner_id))
    owner = result.scalar_one_or_none()
    
    if not owner:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลผู้สมัคร")
    
    # เก็บข้อมูลไว้ก่อนลบ
    target_email = owner.email
    target_name = owner.first_name

    # --- 1. ส่งเมลแจ้งเหตุผล (Background) ---
    email_content = f"""
    <h2>แจ้งผลการสมัครสมาชิก (ไม่ผ่านการอนุมัติ)</h2>
    <p>สวัสดีคุณ {target_name},</p>
    <p>ขออภัย บัญชีของคุณไม่ได้รับการอนุมัติในขณะนี้</p>
    <p style="color: red;"><b>หมายเหตุจากเจ้าหน้าที่:</b> {remark}</p>
    <p>หากคุณมีข้อสงสัย โปรดติดต่อฝ่ายสนับสนุนหรือลองสมัครใหม่อีกครั้ง</p>
    """
    background_tasks.add_task(send_status_email, target_email, "ผลการสมัครสมาชิกถูกปฏิเสธ", email_content)
        
    await db.delete(owner)
    await db.commit()
    return {"status": "success", "message": "ส่งเมลแจ้งเหตุผลและลบข้อมูลเรียบร้อยแล้ว"}



# API สำหรับแอดมินลบ Owner (เจ้าของหอพักที่เคยอนุมัติแล้ว)
@app.delete("/api/admin/delete-owner/{owner_id}")
async def admin_delete_owner(
    owner_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(admin_only),
    rd = Depends(get_redis)
):
    # 1. ค้นหา Owner พร้อมกับข้อมูลหอพักของเขา (ถ้ามี)
    # เราใช้ selectinload เพื่อดึงข้อมูลหอพักมาจัดการลบรูปภาพด้วย
    result = await db.execute(
        select(Owner)
        .where(Owner.id == owner_id)
        .options(selectinload(Owner.dormitories).selectinload(models.Dormitory.images))
    )
    owner = result.scalar_one_or_none()

    if not owner:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลเจ้าของหอพักที่ต้องการลบ")

    owner_email = owner.email
    owner_name = owner.first_name
    username = owner.username

    try:
        # 2. จัดการลบรูปภาพของหอพักทั้งหมดที่เจ้าของคนนี้ครอบครอง (เพื่อไม่ให้ขยะเต็ม Server)
        for dorm in owner.dormitories:
            for img in dorm.images:
                file_path = os.path.join(UPLOAD_DIR, img.filename)
                if os.path.exists(file_path):
                    os.remove(file_path)
            
            # ลบ Cache ของหอพักแต่ละแห่ง
            await rd.delete(f"dorm_detail:{dorm.id}")

        # 3. ลบ Owner จาก Database (เนื่องจากตั้ง Cascade ไว้ หอพักจะถูกลบอัตโนมัติ)
        await db.delete(owner)
        await db.commit()

        # 4. ส่งอีเมลแจ้งเตือนให้เขาทราบ
        email_content = f"""
        <h2>แจ้งการยกเลิกบัญชีสมาชิก</h2>
        <p>สวัสดีคุณ {owner_name},</p>
        <p>บัญชีผู้ใช้งาน <b>{username}</b> ของคุณถูกลบโดยผู้ดูแลระบบ</p>
        <p>ข้อมูลหอพักและรูปภาพทั้งหมดของคุณถูกนำออกจากระบบเรียบร้อยแล้ว</p>
        <p>หากคุณคิดว่านี่คือข้อผิดพลาด โปรดติดต่อผู้ดูแลระบบ</p>
        """
        background_tasks.add_task(send_status_email, owner_email, "บัญชีของคุณถูกลบโดยผู้ดูแลระบบ", email_content)

        # 5. ล้าง Cache ส่วนกลาง
        await rd.delete("admin:all_owners")
        await rd.delete("admin_stats")
        await rd.delete("public_verified_dorms") # หอพักหายไป หน้าแรกต้องอัปเดต

        # 6. แจ้งเตือนแอดมินคนอื่นๆ ผ่าน WebSocket
        await rd.publish("admin_notifications", json.dumps({
            "event": "owner_deleted",
            "data": {"message": f"ลบบัญชีคุณ {username} เรียบร้อยแล้ว", "type": "danger"}
        }))

    except Exception as e:
        await db.rollback()
        print(f"Delete Owner Error: {e}")
        raise HTTPException(status_code=500, detail="เกิดข้อผิดพลาดในการลบข้อมูล")

    return {"status": "success", "message": f"ลบเจ้าของหอพัก {username} และข้อมูลที่เกี่ยวข้องเรียบร้อยแล้ว"}


# แสดงรายชื่อ owner ทั้งหมด
@app.get("/api/admin/all-owners")
async def get_all_owners(
    db: AsyncSession = Depends(get_db),
    rd = Depends(get_redis),
    payload: dict = Depends(admin_only)
):
    cache_key = "admin:all_owners"
    
    # 1. พยายามดึงข้อมูลจาก Redis ก่อน
    cached_data = await rd.get(cache_key)
    if cached_data:
        return json.loads(cached_data)

    # 2. ถ้าไม่มีใน Cache ให้ดึงจาก Database
    # ดึงเฉพาะคนที่ถูกอนุมัติแล้ว (is_approved = True)
    result = await db.execute(select(Owner).where(Owner.is_approved == True))
    owners = result.scalars().all()
    
    # แปลงเป็น list ของ dict
    owner_list = [
        {
            "id": o.id,
            "username": o.username,
            "full_name": f"{o.first_name} {o.last_name}",
            "email": o.email,
            "phone": o.phone,
            "dorm_name": o.dorm_name,
            "is_active": o.is_active
        } for o in owners
    ]
    
    # 3. เก็บลง Redis (ตั้งเวลา Expire 5 นาที เพื่อให้ข้อมูลไม่เก่าจนเกินไป)
    await rd.setex(cache_key, 300, json.dumps(owner_list))
    
    return owner_list


# สำหรับแก้ไขข้อมูล owner
@app.put("/api/admin/update-owner/{owner_id}")
async def update_owner(
    owner_id: int, 
    data: schemas.OwnerUpdate, # เรียกใช้ผ่าน schemas
    db: AsyncSession = Depends(get_db),
    rd = Depends(get_redis),
    payload: dict = Depends(admin_only)
):
    # ... logic เดิมที่คุณเขียนไว้ ...
    result = await db.execute(select(Owner).where(Owner.id == owner_id))
    owner = result.scalar_one_or_none()
    
    if not owner:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูล")

    # อัปเดตข้อมูล
    owner.first_name = data.first_name
    owner.last_name = data.last_name
    owner.phone = data.phone
    owner.dorm_name = data.dorm_name
    owner.is_active = data.is_active

    try:
        await db.commit()
        
        # ลบ Cache เมื่อบันทึกสำเร็จเท่านั้น
        await rd.delete(f"owner:profile:{owner_id}")
        await rd.delete("admin:all_owners")
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail="บันทึกข้อมูลล้มเหลว")
    
    
    return {"status": "success", "message": "อัปเดตเรียบร้อย"}


# แอดมินดึงข้อมูลหอพัก
@app.get("/api/admin/dorms", response_model=List[schemas.DormitoryResponse])
async def admin_get_all_dorms(
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(admin_only) # ตรวจสอบว่าเป็นแอดมิน
):
    result = await db.execute(
        select(models.Dormitory)
        .order_by(models.Dormitory.created_at.desc())
        .options(
            selectinload(models.Dormitory.images),
            selectinload(models.Dormitory.owner), # <--- ต้องเพิ่มบรรทัดนี้ด้วย!!!
            selectinload(models.Dormitory.draft) # 🚨 ต้องเพิ่มบรรทัดนี้ด้วย!!!
        )
    )
    return result.scalars().all()


# 1. API ดึงรายละเอียดหอพัก (พร้อมระบบ Cache)
@app.get("/api/admin/dorms/{dorm_id}", response_model=schemas.DormitoryResponse)
async def get_dorm_detail(
    dorm_id: int, 
    db: AsyncSession = Depends(get_db), 
    rd = Depends(get_redis), 
    payload: dict = Depends(admin_only)
):
    cache_key = f"dorm_detail_admin:{dorm_id}"
    
    # --- Step 1: ลองดึงจาก Redis (เฉพาะเคสทั่วไป) ---
    cached_data = await rd.get(cache_key)
    if cached_data:
        return json.loads(cached_data)

    # --- Step 2: ดึงจาก Database พร้อมข้อมูล Draft ---
    result = await db.execute(
        select(models.Dormitory)
        .where(models.Dormitory.id == dorm_id)
        .options(
            selectinload(models.Dormitory.images),
            selectinload(models.Dormitory.owner),
            selectinload(models.Dormitory.draft) # 🚨 โหลดข้อมูลที่ Owner แก้ไขมาด้วย
        )
    )
    dorm = result.scalar_one_or_none()
    
    if not dorm:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลหอพัก")

    # --- Step 3: จัดการเรื่อง Cache ---
    # ถ้าหอพักอยู่ในสถานะ 'pending' หรือ 'pending_update' เราจะไม่เก็บ Cache 
    # เพื่อให้แอดมินเห็นความเปลี่ยนแปลงล่าสุดตลอดเวลา
    if dorm.verification_status not in ['pending', 'pending_update']:
        dorm_json = jsonable_encoder(dorm)
        await rd.setex(cache_key, 3600, json.dumps(dorm_json))
    
    return dorm


# 2. API สำหรับกดอนุมัติ (พร้อมระบบ Cache Invalidation)
@app.patch("/api/admin/dorms/{dorm_id}/verify")
async def verify_dormitory(
    dorm_id: int, 
    db: AsyncSession = Depends(get_db), 
    rd = Depends(get_redis),
    payload: dict = Depends(admin_only)
):
    # 1. ดึงข้อมูลหอพักพร้อม Draft และรูปภาพ
    result = await db.execute(
        select(models.Dormitory)
        .where(models.Dormitory.id == dorm_id)
        .options(
            selectinload(models.Dormitory.draft),
            selectinload(models.Dormitory.images)
        )
    )
    dorm = result.scalar_one_or_none()
    
    if not dorm:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลหอพัก")

    # --- ส่วนที่ 1: จัดการกรณีเป็น "การอนุมัติข้อมูลที่แก้ไข" (pending_update) ---
    if dorm.verification_status == 'pending_update' and dorm.draft:
        draft = dorm.draft

        # A. ย้ายข้อมูลจาก Draft ลงตารางหลัก
        # ปรับปรุง: ใช้ __table__.columns เพื่อความแม่นยำในการดึงฟิลด์จาก Database จริงๆ
        exclude_fields = {'id', 'dorm_id', 'updated_at', 'new_images_json', 'delete_image_ids'}
        
        for column in models.DormitoryDraft.__table__.columns:
            if column.name not in exclude_fields:
                # ดึงค่าจาก draft มาใส่ใน dorm
                val = getattr(draft, column.name)
                if val is not None: # ป้องกันการเอาค่า None ไปทับข้อมูลเดิมถ้าไม่ได้ตั้งใจ
                    setattr(dorm, column.name, val)

        # B. จัดการลบรูปภาพที่ Owner สั่งลบ (โค้ดเดิมของคุณดีอยู่แล้ว)
        try:
            delete_ids = json.loads(draft.delete_image_ids or "[]")
            if delete_ids:
                # ... (โค้ดดึงรูปและลบไฟล์จริงที่คุณมีอยู่) ...
                img_result = await db.execute(
                    select(models.DormImage).where(
                        models.DormImage.id.in_(delete_ids), 
                        models.DormImage.dorm_id == dorm_id
                    )
                )
                imgs_to_remove = img_result.scalars().all()
                for img in imgs_to_remove:
                    file_path = os.path.join(UPLOAD_DIR, img.filename)
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    await db.delete(img)
        except Exception as e:
            print(f"Error deleting images: {e}")

        # C. ย้ายรูปภาพใหม่จาก Draft เข้าตาราง DormImage
        try:
            new_filenames = json.loads(draft.new_images_json or "[]")
            for filename in new_filenames:
                new_img = models.DormImage(filename=filename, dorm_id=dorm_id)
                db.add(new_img)
        except Exception as e:
            print(f"Error adding new images: {e}")

        # D. ลบข้อมูล Draft ทิ้งหลังจากย้ายเสร็จ
        await db.delete(draft)
        msg_text = f"อนุมัติการแก้ไขข้อมูลหอพัก {dorm.name} สำเร็จ"

    # --- ส่วนที่ 2: จัดการกรณีเป็น "การอนุมัติครั้งแรก" ---
    else:
        if dorm.is_verified:
            return {"message": "หอพักนี้ได้รับการอนุมัติอยู่แล้ว"}
        dorm.is_verified = True
        msg_text = f"อนุมัติหอพัก {dorm.name} สำเร็จ"

    # 2. อัปเดตสถานะสุดท้าย
    dorm.verification_status = 'approved'
    dorm.reject_reason = None
    
    await db.commit()

    # 3. ลบ Cache (Invalidation)
    await rd.delete(f"dorm_detail:{dorm_id}")
    await rd.delete(f"dorm_detail_admin:{dorm_id}") # ลบ Cache ของหน้า Admin ด้วย
    await rd.delete("admin_all_dorms") 
    await rd.delete("admin_stats")

    # 🚨 เพิ่มบรรทัดนี้: เพื่อให้หน้าแรก (Public) อัปเดตข้อมูลใหม่ล่าสุด
    await rd.delete("public_verified_dorms")

    # 4. ส่งสัญญาณ Real-time (โค้ดเดิมของคุณ)
    admin_data = {"message": msg_text, "type": "success"}
    await rd.publish("admin_notifications", json.dumps({
        "event": "stats_updated",
        "data": admin_data
    }))

    owner_notification = {
        "event": "dorm_verified",
        "owner_id": dorm.owner_id,
        "data": {
            "dorm_id": dorm_id,
            "message": f"ข้อมูลล่าสุดของหอพัก {dorm.name} ได้รับการอนุมัติและเผยแพร่แล้ว!"
        }
    }
    await rd.publish("owner_updates", json.dumps(owner_notification))

    return {"message": msg_text}


# API สำหรับ "ไม่ผ่านการอนุมัติ"
@app.patch("/api/admin/dorms/{dorm_id}/reject")
async def reject_dormitory(
    dorm_id: int, 
    reason: dict, 
    db: AsyncSession = Depends(get_db), 
    rd = Depends(get_redis),
    payload: dict = Depends(admin_only)
):
    # 1. ดึงข้อมูลหอพักพร้อม Draft
    result = await db.execute(
        select(models.Dormitory)
        .where(models.Dormitory.id == dorm_id)
        .options(selectinload(models.Dormitory.draft))
    )
    dorm = result.scalar_one_or_none()
    
    if not dorm:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลหอพัก")
    
    reject_reason_text = reason.get("reason", "ข้อมูลไม่ถูกต้องตามระเบียบ")

    # --- ส่วนที่เพิ่ม: จัดการกรณีปฏิเสธ "การแก้ไขข้อมูล" (Draft) ---
    if dorm.verification_status == 'pending_update' and dorm.draft:
        draft = dorm.draft
        
        # A. ลบรูปภาพใหม่ที่ Owner อัปโหลดค้างไว้ใน Draft (ไฟล์ที่ขึ้นต้นด้วย draft_)
        new_filenames = json.loads(draft.new_images_json or "[]")
        for filename in new_filenames:
            file_path = os.path.join(UPLOAD_DIR, filename)
            if os.path.exists(file_path):
                os.remove(file_path)

        # B. ลบข้อมูล Draft ทิ้ง
        await db.delete(draft)
        
        # C. เปลี่ยนสถานะกลับเป็น 'approved' (เพราะของเดิมเขาเคยผ่านการอนุมัติแล้ว)
        dorm.verification_status = "approved"
        msg_text = f"ปฏิเสธการแก้ไขข้อมูลของ {dorm.name} เรียบร้อยแล้ว"

    # --- ส่วนเดิม: จัดการกรณีปฏิเสธ "หอพักใหม่" ---
    else:
        dorm.verification_status = "rejected"
        dorm.is_verified = False
        dorm.reject_reason = reject_reason_text
        msg_text = f"ปฏิเสธการอนุมัติหอพัก {dorm.name} เรียบร้อยแล้ว"
    
    await db.commit()

    # 2. เคลียร์ Cache
    await rd.delete("admin_stats")
    await rd.delete("admin_all_dorms")
    await rd.delete(f"dorm_detail:{dorm_id}")
    await rd.delete(f"dorm_detail_admin:{dorm_id}")

    # 3. ส่งแจ้งเตือน Real-time ให้เจ้าของหอพัก
    await rd.publish("owner_updates", json.dumps({
        "event": "dorm_rejected",
        "owner_id": dorm.owner_id,
        "data": {
            "dorm_id": dorm_id,
            "dorm_name": dorm.name,
            "message": f"คำขอของคุณสำหรับหอพัก {dorm.name} ไม่ผ่านการอนุมัติ: {reject_reason_text}",
            "reject_reason": reject_reason_text
        }
    }))

    # 4. ส่งสัญญาณให้ Admin ทุกคนรีโหลดหน้าจอ (stats_updated)
    await rd.publish("admin_notifications", json.dumps({
        "event": "stats_updated",
        "data": {"message": msg_text, "type": "warning"}
    }))

    return {"message": msg_text}


# API สรุปสถติ
@app.get("/api/admin/stats")
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    rd = Depends(get_redis),
    payload: dict = Depends(admin_only)
):
    cache_key = "admin_stats"
    
    # 1. ลองดึงจาก Redis (ถ้ามีตัวเลขที่ถูก Cache ไว้และยังไม่โดนสั่งลบ จะส่งกลับทันที)
    cached_stats = await rd.get(cache_key)
    if cached_stats:
        return json.loads(cached_stats)

    # 2. ถ้าไม่มีใน Cache (เช่น เพิ่งถูกลบหอพักไป ทำให้ Key นี้หายไป) -> นับจาก DB ใหม่
    # ใช้ scalar_one() หรือ scalar() เพื่อดึงค่าตัวเลขออกมาตรงๆ
    v_res = await db.execute(select(func.count(models.Dormitory.id)).where(models.Dormitory.is_verified == True))
    p_res = await db.execute(select(func.count(models.Dormitory.id)).where(models.Dormitory.is_verified == False))
    o_res = await db.execute(select(func.count(models.Owner.id)))

    stats_data = {
        "verified_dorms": v_res.scalar() or 0,
        "pending_dorms": p_res.scalar() or 0,
        "total_owners": o_res.scalar() or 0,
        "reports_count": 0  # ถ้ามีตารางแจ้งเหตุค่อยมานับตรงนี้
    }

    # 3. เก็บลง Redis ใหม่ 
    # ทริค: ถ้ามีการอัปเดตบ่อยๆ ลดเวลาเหลือ 600 (10 นาที) ก็ได้ครับ 
    # แต่จริงๆ ตั้งเท่าไหร่ก็ได้ เพราะเรามีระบบ "กวาดล้าง Cache" ในฟังก์ชันลบ/อนุมัติอยู่แล้ว
    await rd.setex(cache_key, 1800, json.dumps(stats_data))
    
    return stats_data




# เพิ่มขา GET เพื่อให้หน้าบ้านดึงข้อมูลมาใส่ใน Modal ได้
@app.get("/api/admin/dorm-detail/{dorm_id}")
async def get_dorm_detail_for_admin(
    dorm_id: int, 
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(admin_only) # ตรวจสอบว่าเป็นแอดมินจริงไหม
):
    # ค้นหาหอพักและโหลดรูปภาพมาด้วย
    result = await db.execute(
        select(models.Dormitory)
        .where(models.Dormitory.id == dorm_id)
        .options(selectinload(models.Dormitory.images))
    )
    dorm = result.scalar_one_or_none()
    
    if not dorm:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลหอพักนี้ในระบบ")
        
    return dorm


# API สำหรับแอดมินแก้ไขข้อมูลหอพักโดยตรง (Overwrite)
@app.put("/api/admin/update-dorm/{dorm_id}")
async def admin_update_dormitory(
    dorm_id: int,
    name: str = Form(...),
    room_type: str = Form(None),
    distance_to_rmuti: str = Form(None),
    description: str = Form(None),
    address: str = Form(None),
    dorm_type: str = Form("หอพักรวม"),
    google_map_link: str = Form(None),
    price_start: int = Form(...),
    vacancy_count: int = Form(0),
    contact_number: str = Form(...),
    line_id: str = Form(None),
    # --- Boolean Flags ---
    has_wifi: bool = Form(False),
    has_air_conditioner: bool = Form(False),
    has_parking: bool = Form(False),
    has_laundry: bool = Form(False),
    is_pet_friendly: bool = Form(False),
    has_water_heater: bool = Form(False),
    has_elevator: bool = Form(False),
    has_furniture: bool = Form(False),
    has_refrigerator: bool = Form(False),
    has_keycard: bool = Form(False),
    has_cctv: bool = Form(False),
    has_security_guard: bool = Form(False),
    has_fitness: bool = Form(False),
    has_drinking_water: bool = Form(False),
    # --- รูปภาพ ---
    delete_image_ids: str = Form("[]"), # รับ ID รูปที่จะลบเป็น JSON string
    images: List[UploadFile] = File(None), # รับไฟล์รูปใหม่
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(admin_only),
    rd = Depends(get_redis)
):
    # 1. ค้นหาหอพัก
    result = await db.execute(
        select(models.Dormitory).where(models.Dormitory.id == dorm_id)
        .options(selectinload(models.Dormitory.images))
    )
    db_dorm = result.scalar_one_or_none()
    if not db_dorm:
        raise HTTPException(status_code=404, detail="ไม่พบหอพัก")

    # 2. อัปเดตข้อมูล Text/Boolean
    update_data = {
        "name": name, "room_type": room_type, "distance_to_rmuti": distance_to_rmuti,
        "description": description, "address": address, "dorm_type": dorm_type,
        "google_map_link": google_map_link, "price_start": price_start,
        "vacancy_count": vacancy_count, "contact_number": contact_number, "line_id": line_id,
        "has_wifi": has_wifi, "has_air_conditioner": has_air_conditioner,
        "has_parking": has_parking, "has_laundry": has_laundry, "is_pet_friendly": is_pet_friendly,
        "has_water_heater": has_water_heater, "has_elevator": has_elevator,
        "has_furniture": has_furniture, "has_refrigerator": has_refrigerator,
        "has_keycard": has_keycard, "has_cctv": has_cctv, "has_security_guard": has_security_guard,
        "has_fitness": has_fitness, "has_drinking_water": has_drinking_water
    }
    
    for key, value in update_data.items():
        setattr(db_dorm, key, value)

    # 3. จัดการลบรูปภาพ (Delete existing images)
    try:
        target_ids = json.loads(delete_image_ids)
        if target_ids:
            # กรองรูปที่มี ID ตรงกับที่ส่งมา
            images_to_delete = [img for img in db_dorm.images if img.id in target_ids]
            for img in images_to_delete:
                # ลบไฟล์จริงในเครื่อง
                file_path = os.path.join(UPLOAD_DIR, img.filename)
                if os.path.exists(file_path):
                    os.remove(file_path)
                # ลบ record ใน DB
                await db.delete(img)
    except Exception as e:
        print(f"Error deleting images: {e}")

    # 4. จัดการเพิ่มรูปภาพใหม่ (Add new images)
    if images:
        for file in images:
            if file and file.filename:
                ext = os.path.splitext(file.filename)[1]
                new_fname = f"{uuid.uuid4()}{ext}"
                content = await file.read()
                with open(os.path.join(UPLOAD_DIR, new_fname), "wb") as f:
                    f.write(content)
                # เพิ่ม record รูปใหม่
                db.add(models.DormImage(filename=new_fname, dorm_id=db_dorm.id))

    # 5. บันทึกและเคลียร์ Cache
    await db.commit()
    await rd.delete("admin_all_dorms")
    await rd.delete("admin_stats")

    await rd.delete("public_verified_dorms") # ล้างแคชรายการหน้าแรก
    await rd.delete(f"dorm_detail:{dorm_id}") # ล้างแคชหน้ารายละเอียดของหอพักนี้

    # 1. ดึง owner_id ของหอพักนี้มา (สำคัญมากเพื่อให้หน้า Owner กรองข้อมูลได้)
    owner_id = db_dorm.owner_id 

    # 2. ส่งสัญญาณผ่าน Redis (Channel: admin_notifications)
    # เราจะส่งไปในรูปแบบที่โค้ด JavaScript ของคุณรอรับอยู่
    update_signal = {
        "event": "dorm_updated_by_admin", 
        "owner_id": owner_id,  # ส่ง ID เจ้าของไปด้วย
        "data": {
            "dorm_id": dorm_id,
            "message": f"แอดมินได้อัปเดตข้อมูลหอพัก '{name}' ของคุณแล้ว",
            "type": "info"
        }
    }
    
    # ส่งสัญญาณ (ควรใช้ channel เดียวกับที่ WebSocket ฝั่ง Owner ดักฟังอยู่)
    # สมมติว่า WebSocket คุณดักฟังที่ "admin_notifications"
    await rd.publish("admin_notifications", json.dumps(update_signal))

    # ส่ง Notification ผ่าน WebSocket
    await rd.publish("admin_notifications", json.dumps({
        "event": "stats_updated",
        "data": {"message": f"แอดมินอัปเดตข้อมูลและรูปภาพหอพัก: {name}", "type": "success"}
    }))

    return {"status": "success", "message": "อัปเดตข้อมูลและจัดการรูปภาพเรียบร้อย"}



# API สำหรับแอดมินลบหอพัก
@app.delete("/api/admin/delete-dorm/{dorm_id}")
async def admin_delete_dormitory(
    dorm_id: int, 
    db: AsyncSession = Depends(get_db), 
    payload: dict = Depends(admin_only), 
    rd = Depends(get_redis)
):
    # 1. ค้นหาหอพัก
    result = await db.execute(
        select(models.Dormitory)
        .where(models.Dormitory.id == dorm_id)
        .options(selectinload(models.Dormitory.images))
    )
    dorm = result.scalar_one_or_none()
    
    if not dorm:
        raise HTTPException(status_code=404, detail="ไม่พบหอพักที่ต้องการลบ")

    dorm_name = dorm.name
    owner_id = dorm.owner_id # เก็บ ID เจ้าของไว้ส่งแจ้งเตือน
    image_filenames = [img.filename for img in dorm.images]

    try:
        # 2. ลบไฟล์รูปภาพ
        for filename in image_filenames:
            file_path = os.path.join(UPLOAD_DIR, filename)
            if os.path.exists(file_path):
                os.remove(file_path)

        # 3. ลบจาก Database
        await db.delete(dorm)
        await db.commit()

        # 4. จัดการ Cache และ Real-time Notifications
        await rd.delete("admin_all_dorms")
        await rd.delete("admin_stats")

        # 🚨 เพิ่มบรรทัดนี้: ลบแคชหน้าแรก เพราะหอพักหายไปจากระบบแล้ว
        await rd.delete("public_verified_dorms")
        # 🚨 และอย่าลืมลบแคชรายละเอียดหอพักตัวนั้นด้วย (เผื่อมีคนค้างหน้านั้นอยู่)
        await rd.delete(f"dorm_detail:{dorm_id}")


        # --- แจ้งเตือนฝั่ง Admin ด้วยกันเอง (เช่น หน้าจอ Dashboard แอดมินคนอื่น) ---
        await rd.publish("admin_notifications", json.dumps({
            "event": "stats_updated",
            "data": {"message": f"แอดมินลบหอพัก: {dorm_name}", "type": "warning"}
        }))

        # --- 🚨 แจ้งเตือนฝั่ง Owner (เจ้าของหอพัก) 🚨 ---
        # เพื่อให้หน้าจอเจ้าของหอพักรีโหลด และรู้ว่าหอพักถูกลบโดยแอดมิน
        owner_signal = {
            "event": "my_dorm_deleted", # ใช้ event เดิมที่ owner.js ดักอยู่ได้เลย
            "owner_id": owner_id,
            "data": {
                "id": dorm_id, 
                "message": f"หอพัก '{dorm_name}' ของคุณถูกลบโดยผู้ดูแลระบบ"
            }
        }
        await rd.publish("admin_notifications", json.dumps(owner_signal))

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"เกิดข้อผิดพลาด: {str(e)}")

    return {"status": "success", "message": f"ลบหอพัก '{dorm_name}' เรียบร้อยแล้ว"}


# หน้า owner
@app.get("/owner/dashboard", response_class=HTMLResponse)
async def owner_dashboard(
    request: Request, 
    payload: dict = Depends(owner_only) # เรียกใช้ด่านตรวจตรงนี้
):
    # ผ่านด่านเรียบร้อย
    context = {
        "request": request,
        "owner_user": payload.get("sub"),
        "user_id": payload.get("user_id")
    }
    return templates.TemplateResponse("owner_dashboard.html", context)


# แสดงชื่อ owner 
@app.get("/api/owner/me")
async def get_owner_profile(
    db: AsyncSession = Depends(get_db),
    rd = Depends(get_redis),
    payload: dict = Depends(owner_only)
):
    owner_id = payload.get("user_id")
    cache_key = f"owner:profile:{owner_id}"

    # 1. ลองดึงข้อมูลจาก Redis
    cached_data = await rd.get(cache_key)
    if cached_data:
        data = json.loads(cached_data)
        # --- จุดที่ 1: ตรวจสอบว่าใน Cache มี id หรือยัง ถ้าไม่มีให้เติมเข้าไป ---
        if "id" not in data:
            data["id"] = owner_id
        return data

    # 2. ถ้าใน Redis ไม่มี ให้ดึงจาก DB
    result = await db.execute(select(Owner).where(Owner.id == owner_id))
    owner = result.scalar_one_or_none()
    
    if not owner:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูล")
    
    # --- จุดที่ 2: เพิ่ม "id": owner_id ลงใน profile_data ---
    profile_data = {
        "id": owner_id,  # <--- เพิ่มบรรทัดนี้!!!
        "first_name": owner.first_name,
        "last_name": owner.last_name,
        "dorm_name": owner.dorm_name,
        "is_approved": owner.is_approved
    }

    # 3. เก็บลง Redis
    await rd.setex(cache_key, 3600, json.dumps(profile_data))
    
    return profile_data


# API เพิ่มหอพัก
@app.post("/api/owner/add-dorm", response_model=schemas.DormitoryResponse,dependencies=[Depends(RateLimiter(times=2, seconds=60))])
async def create_dormitory(
    name: str = Form(...),
    room_type: str = Form(None),
    distance_to_rmuti: str = Form(None),
    description: str = Form(None),
    address: str = Form(None),
    dorm_type: str = Form("หอพักรวม"),
    google_map_link: str = Form(None),
    price_start: int = Form(...),
    vacancy_count: int = Form(0),
    contact_number: str = Form(...),
    line_id: str = Form(None),
    has_wifi: bool = Form(False),
    has_air_conditioner: bool = Form(False),
    has_parking: bool = Form(False),
    has_laundry: bool = Form(False),
    is_pet_friendly: bool = Form(False),
    has_water_heater: bool = Form(False),
    has_elevator: bool = Form(False),
    has_furniture: bool = Form(False),
    has_refrigerator: bool = Form(False),
    has_keycard: bool = Form(False),
    has_cctv: bool = Form(False),
    has_security_guard: bool = Form(False),
    has_fitness: bool = Form(False),
    has_drinking_water: bool = Form(False),
    images: List[UploadFile] = File(None), 
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(owner_only),
    rd = Depends(get_redis) # เพิ่มตัวแปร redis เข้ามา
):
    owner_id = payload.get("user_id")

    # 1. สร้าง Object
    new_dorm = models.Dormitory(
        name=name,
        room_type=room_type,
        distance_to_rmuti=distance_to_rmuti,
        description=description,
        address=address,
        dorm_type=dorm_type,
        google_map_link=google_map_link,
        price_start=price_start,
        vacancy_count=vacancy_count,
        contact_number=contact_number,
        line_id=line_id,
        has_wifi=has_wifi,
        has_air_conditioner=has_air_conditioner,
        has_parking=has_parking,
        has_laundry=has_laundry,
        is_pet_friendly=is_pet_friendly,
        has_water_heater=has_water_heater,
        has_elevator=has_elevator,
        has_furniture=has_furniture,
        has_refrigerator=has_refrigerator,
        has_keycard=has_keycard,
        has_cctv=has_cctv,
        has_security_guard=has_security_guard,
        has_fitness=has_fitness,
        has_drinking_water=has_drinking_water,
        owner_id=owner_id,
        is_verified=False
    )

    db.add(new_dorm)
    
    try:
        await db.flush() # เพื่อเอา ID มาใช้

        # 2. จัดการรูปภาพ
        if images:
            for file in images:
                # ตรวจสอบว่ามีไฟล์จริงๆ (ป้องกันเคสส่งลิสต์ว่าง)
                if file.filename:
                    ext = os.path.splitext(file.filename)[1]
                    new_filename = f"{uuid.uuid4()}{ext}"
                    file_path = os.path.join(UPLOAD_DIR, new_filename)

                    content = await file.read()
                    with open(file_path, "wb") as buffer:
                        buffer.write(content)

                    new_image = models.DormImage(
                        filename=new_filename,
                        dorm_id=new_dorm.id
                    )
                    db.add(new_image)

        await db.commit()
        
        # 3. โหลดข้อมูลใหม่พร้อมรูปภาพ เพื่อให้ตรงกับ DormitoryResponse Schema
        # บรรทัดนี้สำคัญมาก!
        result = await db.execute(
            select(models.Dormitory)
            .where(models.Dormitory.id == new_dorm.id)
            .options(
                selectinload(models.Dormitory.images),
                selectinload(models.Dormitory.owner)
            )
        )
        dorm_data = result.scalar_one_or_none()

        if not dorm_data:
             raise HTTPException(status_code=404, detail="ไม่พบข้อมูลหอพักหลังบันทึก")

        # --- ส่วนที่เพิ่มใหม่: แจ้งเตือน Admin ผ่าน Redis (แบบปลอดภัย) ---
        try:
            notification_data = {
                "event": "new_dorm_added",
                "data": {
                    "name": dorm_data.name,
                    "owner_id": dorm_data.owner_id,
                    "price": dorm_data.price_start,
                    "message": f"มีการเพิ่มหอพักใหม่: {dorm_data.name}"
                }
            }
            await rd.publish("admin_notifications", json.dumps(notification_data))
        except Exception as redis_err:
            print(f"Redis Notification Error: {redis_err}")
            # ไม่ต้อง raise error เพราะเราบันทึกข้อมูลลง DB สำเร็จแล้ว
        # ----------------------------------------------
        
        # --- ส่วนที่เพิ่ม/แก้ไข: แจ้งเตือน Owner ผ่าน Redis ---
        try:
            owner_notification = {
                "event": "my_dorm_added", # ตั้งชื่อ event ให้ต่างจากของ admin
                "owner_id": owner_id,     # สำคัญมาก: เพื่อเช็คว่าเป็นของเจ้าของคนนี้
                "data": {
                    "id": dorm_data.id,
                    "name": dorm_data.name,
                    "message": "เพิ่มหอพักของคุณเรียบร้อยแล้ว!"
                }
            }
            #เปลี่ยนจาก admin_notifications เป็น owner_notifications
            await rd.publish("owner_updates", json.dumps(owner_notification))
        except Exception as redis_err:
            print(f"Redis Notification Error: {redis_err}")


        return dorm_data

    except Exception as e:
        await db.rollback()
        print(f"DEBUG ERROR: {str(e)}") # ดู Error เต็มๆ ใน Terminal
        raise HTTPException(status_code=500, detail=f"เกิดข้อผิดพลาด: {str(e)}")


# API ดึงหอพัก owner
@app.get("/api/owner/my-dorms")
async def get_my_dorms(
    db: AsyncSession = Depends(get_db), # ใช้ AsyncSession
    payload: dict = Depends(owner_only)
):
    owner_id = payload.get("user_id")
    
    # ใช้ select() แทน .query() สำหรับ Async
    stmt = select(models.Dormitory)\
        .options(selectinload(models.Dormitory.images))\
        .where(models.Dormitory.owner_id == owner_id)\
        .order_by(models.Dormitory.created_at.desc())
        
    result = await db.execute(stmt)
    dorms = result.scalars().all()
    
    return dorms


# API owner แก้ไขข้อมูลหอพัก (ก่อนแอดมินอนุมัติ)
@app.put("/api/owner/update-dorm/{dorm_id}", response_model=schemas.DormitoryResponse)
async def update_dormitory(
    dorm_id: int,
    name: str = Form(...),
    room_type: str = Form(None),           # <--- เพิ่มกลับเข้ามา
    distance_to_rmuti: str = Form(None),   # <--- เพิ่มกลับเข้ามา
    description: str = Form(None),         # <--- เพิ่มกลับเข้ามา
    address: str = Form(None),             # <--- เพิ่มกลับเข้ามา
    dorm_type: str = Form("หอพักรวม"),      # <--- เพิ่มกลับเข้ามา
    google_map_link: str = Form(None),     # <--- เพิ่มกลับเข้ามา
    price_start: int = Form(...),          # <--- เพิ่มกลับเข้ามา
    vacancy_count: int = Form(0),          # <--- เพิ่มกลับเข้ามา
    contact_number: str = Form(...),       # <--- เพิ่มกลับเข้ามา
    line_id: str = Form(None),             # <--- เพิ่มกลับเข้ามา
    # --- Boolean Flags ---
    has_wifi: bool = Form(False),
    has_air_conditioner: bool = Form(False),
    has_parking: bool = Form(False),
    has_laundry: bool = Form(False),
    is_pet_friendly: bool = Form(False),
    has_water_heater: bool = Form(False),
    has_elevator: bool = Form(False),
    has_furniture: bool = Form(False),
    has_refrigerator: bool = Form(False),
    has_keycard: bool = Form(False),
    has_cctv: bool = Form(False),
    has_security_guard: bool = Form(False),
    has_fitness: bool = Form(False),
    has_drinking_water: bool = Form(False),
    # ---------------------
    delete_image_ids: str = Form("[]"),
    images: List[UploadFile] = File(None), 
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(owner_only),
    rd = Depends(get_redis)
):
    owner_id = payload.get("user_id")
    # ประกาศไว้บนสุดเพื่อป้องกัน NameError ในภายหลัง
    new_img_filenames = [] 

    # 1. ค้นหาหอพักเดิมพร้อมข้อมูลที่จำเป็น
    result = await db.execute(
        select(models.Dormitory).where(
            models.Dormitory.id == dorm_id, 
            models.Dormitory.owner_id == owner_id
        ).options(selectinload(models.Dormitory.images))
    )
    db_dorm = result.scalar_one_or_none()
    
    if not db_dorm:
        raise HTTPException(status_code=404, detail="ไม่พบหอพัก หรือคุณไม่มีสิทธิ์แก้ไข")

    # --- เตรียมข้อมูลพื้นฐาน (Common Fields) ---
    common_data = {
        "name": name, "room_type": room_type, "distance_to_rmuti": distance_to_rmuti,
        "description": description, "address": address, "dorm_type": dorm_type,
        "google_map_link": google_map_link, "price_start": price_start,
        "vacancy_count": vacancy_count, "contact_number": contact_number, "line_id": line_id,
        "has_wifi": has_wifi, "has_air_conditioner": has_air_conditioner,
        "has_parking": has_parking, "has_laundry": has_laundry, "is_pet_friendly": is_pet_friendly,
        "has_water_heater": has_water_heater, "has_elevator": has_elevator,
        "has_furniture": has_furniture, "has_refrigerator": has_refrigerator,
        "has_keycard": has_keycard, "has_cctv": has_cctv, "has_security_guard": has_security_guard,
        "has_fitness": has_fitness, "has_drinking_water": has_drinking_water
    }

    # --- 🚀 CASE A: ยังไม่ผ่านการอนุมัติ (เขียนทับตรงๆ) ---
    if not db_dorm.is_verified:
        for key, value in common_data.items():
            setattr(db_dorm, key, value)
        
        db_dorm.verification_status = 'pending'
        db_dorm.reject_reason = None

        # 1. จัดการลบรูป
        try:
            target_ids = json.loads(delete_image_ids)
            if target_ids:
                images_to_delete = [img for img in db_dorm.images if img.id in target_ids]
                for img in images_to_delete:
                    path = os.path.join(UPLOAD_DIR, img.filename)
                    if os.path.exists(path): os.remove(path)
                    await db.delete(img)
        except: pass

        # 2. เพิ่มรูปใหม่
        if images:
            for file in images:
                if file and file.filename:
                    ext = os.path.splitext(file.filename)[1]
                    fname = f"{uuid.uuid4()}{ext}"
                    content = await file.read()
                    with open(os.path.join(UPLOAD_DIR, fname), "wb") as f:
                        f.write(content)
                    db.add(models.DormImage(filename=fname, dorm_id=db_dorm.id))
        
        # 🌟 สำคัญ: ต้อง Commit ตรงนี้เพื่อให้ Case A บันทึกลง DB จริงๆ
        await db.commit()

        # 🔥 เพิ่ม: ส่งสัญญาณให้แอดมินรู้ว่ามีการอัปเดตข้อมูลหอพักใหม่ (Case A)
        admin_data_a = {
            "event": "dorm_updated", 
            "data": {
                "message": f"ข้อมูลหอพักที่รออนุมัติถูกแก้ไข: {db_dorm.name}",
                "type": "info"
            }
        }
        await rd.publish("admin_notifications", json.dumps(admin_data_a))

    # --- 🚀 CASE B: ผ่านการอนุมัติแล้ว (ใช้ Draft เท่านั้น) ---
    else:
        draft_res = await db.execute(select(models.DormitoryDraft).where(models.DormitoryDraft.dorm_id == dorm_id))
        draft = draft_res.scalar_one_or_none()
        if not draft:
            draft = models.DormitoryDraft(dorm_id=dorm_id)
            db.add(draft)

        for key, value in common_data.items():
            setattr(draft, key, value)

        # 💡 จัดการรูปภาพใน Draft (รวมไฟล์ใหม่เข้ากับไฟล์เดิมใน Draft ถ้ามี)
        current_draft_images = json.loads(draft.new_images_json or "[]")
        
        if images:
            for file in images:
                if file.filename:
                    ext = os.path.splitext(file.filename)[1]
                    fname = f"draft_{uuid.uuid4()}{ext}"
                    content = await file.read()
                    with open(os.path.join(UPLOAD_DIR, fname), "wb") as f:
                        f.write(content)
                    current_draft_images.append(fname)

        draft.new_images_json = json.dumps(current_draft_images)
        draft.delete_image_ids = delete_image_ids # เก็บ ID รูปเดิมที่จะลบเมื่อแอดมินอนุมัติ
        draft.updated_at = datetime.utcnow()
        db_dorm.verification_status = 'pending_update'

        # 🔥 --- ส่วนที่เพิ่มเพื่อความ Real-time --- 🔥
        await db.commit() # Commit ก่อนเพื่อล้าง Cache และส่ง Notification
        
        # 1. ลบ Cache หน้า Admin เพื่อให้ดึงข้อมูลใหม่ที่ถูกต้อง
        await rd.delete("admin_all_dorms") 
        await rd.delete("admin_stats")
        await rd.delete(f"dorm_detail_admin:{dorm_id}")

        # 2. ส่งสัญญาณ Publish ไปหา Admin Dashboard
        admin_data = {
            "event": "stats_updated", # หรือตั้งชื่อ event ที่คุณดักไว้ใน Frontend
            "data": {
                "message": f"มีการขอแก้ไขข้อมูลหอพัก: {db_dorm.name}",
                "type": "info"
            }
        }
        await rd.publish("admin_notifications", json.dumps(admin_data))
        # ------------------------------------------

        # --- ส่วนสุดท้าย: ดึงข้อมูลกลับไปโชว์ ---
        # ล้างสถานะ Object เดิมเพื่อให้ดึงข้อมูลใหม่จาก DB หลัง Commit
        await db.refresh(db_dorm)
    
    # ดึงข้อมูลกลับเพื่อส่ง Response (เน้นโหลด draft ออกไปด้วย)
    final_res = await db.execute(
        select(models.Dormitory)
        .where(models.Dormitory.id == dorm_id)
        .options(
            selectinload(models.Dormitory.images), 
            selectinload(models.Dormitory.draft),
            selectinload(models.Dormitory.owner)  # 👈 เพิ่มบรรทัดนี้ครับ!
        )
    )
    
    return final_res.scalar_one()


# API ลบหอพัก
@app.delete("/api/owner/delete-dorm/{dorm_id}")
async def delete_dorm(
    dorm_id: int, 
    payload: dict = Depends(owner_only), 
    db: AsyncSession = Depends(get_db), # เปลี่ยนเป็น AsyncSession ให้ตรงกับที่ระบบคุณใช้
    rd = Depends(get_redis)
):
    # ดึง user_id จาก payload (อิงตาม add-dorm ที่คุณส่งมาคือ user_id)
    owner_id = payload.get("user_id") 
    
    # 1. ค้นหาหอพักด้วยวิธี Async (ใช้ select แทน query)
    result = await db.execute(
        select(models.Dormitory)
        .where(models.Dormitory.id == dorm_id, models.Dormitory.owner_id == owner_id)
        .options(selectinload(models.Dormitory.images)) # โหลดรูปภาพมาด้วยเพื่อเอาชื่อไฟล์ไปลบ
    )
    dorm = result.scalar_one_or_none()
    
    if not dorm:
        raise HTTPException(status_code=404, detail="ไม่พบหอพักหรือคุณไม่มีสิทธิ์ลบ")

    # --- 🚨 ส่วนที่เพิ่มเพื่อความปลอดภัย (Data Integrity & Logging) ---
    if dorm.is_verified:
        # บันทึก Log ลง Console หรือระบบ Log ของคุณ
        print(f"⚠️ [SECURITY ALERT] Verified Dormitory Deleted!")
        print(f"Dorm Name: {dorm.name} (ID: {dorm.id})")
        print(f"Deleted by Owner ID: {owner_id}")
        # คุณอาจเพิ่มตาราง DeletedLog ใน DB แล้วเก็บข้อมูลไว้ที่นี่ก่อนลบจริงก็ได้
    # -----------------------------------------------------------

    dorm_name = dorm.name
    image_filenames = [img.filename for img in dorm.images]

    try:
        # 2. ลบไฟล์จริงออกจากโฟลเดอร์
        upload_dir = "static/uploads/dorms"
        for filename in image_filenames:
            file_path = os.path.join(upload_dir, filename)
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"🗑️ Deleted file: {filename}")

        # 3. ลบข้อมูลจาก Database (ต้องใช้ await)
        await db.delete(dorm)
        await db.commit()

        # 🔥 4. การจัดการ Cache และสัญญาณ Real-time 🔥
        
        # --- ลบ Cache ทิ้งเพื่อให้ระบบไปดึงค่าใหม่จาก DB ---
        await rd.delete("admin_stats")        
        await rd.delete("admin_all_dorms")   
        await rd.delete(f"dorm_detail:{dorm_id}")

        # --- เตรียมข้อมูลสำหรับแจ้งเตือน Admin ---
        admin_data = {
            "id": dorm_id, 
            "name": dorm_name, 
            "message": f"หอพัก '{dorm_name}' ถูกลบโดยเจ้าของ"
        }

        # 1. ส่งสัญญาณให้ Admin รีโหลดตัวเลขสถิติ (Stats Card)
        await rd.publish("admin_notifications", json.dumps({
            "event": "stats_updated", 
            "data": admin_data
        }))

        # 2. ส่งสัญญาณแจ้งว่ามีการลบ (เพื่อให้ Grid รายการอัปเดต หรือปิด Modal)
        await rd.publish("admin_notifications", json.dumps({
            "event": "dorm_deleted_by_owner", 
            "data": admin_data
        }))

        # 3. แจ้งฝั่ง Owner (คนลบ)
        owner_notification = {
            "event": "my_dorm_deleted",
            "owner_id": owner_id,
            "data": {"id": dorm_id, "message": f"ลบหอพัก '{dorm_name}' เรียบร้อยแล้ว"}
        }
        await rd.publish("owner_updates", json.dumps(owner_notification))

    except Exception as e:
        await db.rollback()
        print(f"❌ DELETE ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"เกิดข้อผิดพลาดในการลบ: {str(e)}")

    return {"message": "ลบหอพักสำเร็จ"}


# API เช็คยอดเข้าชม
@app.get("/api/owner/statistics")
async def get_owner_statistics(
    payload: dict = Depends(owner_only),
    db: AsyncSession = Depends(get_db),
    rd = Depends(get_redis) # 👈 เพิ่ม Redis เข้ามา
):
    owner_id = payload.get("user_id") 
    cache_key = f"owner_stats:{owner_id}"

    # --- 1. ลองดึงจาก Cache ก่อน ---
    cached_stats = await rd.get(cache_key)
    if cached_stats:
        return json.loads(cached_stats)

    # --- 2. ถ้าไม่มีใน Cache ค่อยไปดึง DB (โค้ดเดิมของคุณ) ---
    result = await db.execute(
        select(models.Dormitory.id, models.Dormitory.name, models.Dormitory.total_views)
        .where(models.Dormitory.owner_id == owner_id)
    )
    dorms = result.all()

    if not dorms:
        return {"summary": {"today": 0, "total": 0}, "dorms": []}

    dorm_ids = [d.id for d in dorms]
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    today_stats_stmt = (
        select(models.DormViewLog.dorm_id, func.count(models.DormViewLog.id))
        .where(models.DormViewLog.dorm_id.in_(dorm_ids), models.DormViewLog.viewed_at >= today_start)
        .group_by(models.DormViewLog.dorm_id)
    )
    today_res = await db.execute(today_stats_stmt)
    today_map = {row[0]: row[1] for row in today_res.all()}

    dorm_list = []
    total_sum = 0
    today_sum = 0

    for d in dorms:
        t_view = today_map.get(d.id, 0)
        dorm_list.append({
            "id": d.id, "name": d.name,
            "today_views": t_view, "total_views": d.total_views
        })
        total_sum += d.total_views
        today_sum += t_view

    response_data = {
        "summary": {"today": today_sum, "total": total_sum},
        "dorms": dorm_list
    }

    # --- 3. เก็บเข้า Cache (ตั้งเวลาสั้นๆ เช่น 120 วินาที) ---
    await rd.setex(cache_key, 120, json.dumps(response_data))

    return response_data


# API สำหรับเจ้าของหอเรียกดูรายการจองทั้งหมดของตนเอง
@app.get("/api/owner/bookings")
async def get_owner_bookings(
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(owner_only)
):
    owner_id = payload.get("user_id")
    
    # 1. ใช้ joinedload เพื่อดึงข้อมูล Dormitory มาพร้อมกับ Booking ใน Query เดียว
    stmt = select(models.DormBooking)\
        .join(models.Dormitory)\
        .options(joinedload(models.DormBooking.dormitory))\
        .where(models.Dormitory.owner_id == owner_id)\
        .order_by(models.DormBooking.created_at.desc())
        
    result = await db.execute(stmt)
    bookings = result.scalars().all()
    
    # 2. แปลงข้อมูลเป็น List ของ Dict เพื่อแนบชื่อหอพัก (dorm_name) เข้าไป
    output = []
    for b in bookings:
        output.append({
            "id": b.id,
            "guest_name": b.guest_name,
            "guest_phone": b.guest_phone,
            "check_in_date": b.check_in_date,
            "remark": b.remark,
            "status": b.status,
            "dorm_name": b.dormitory.name  # 🔥 ดึงชื่อหอพักจากความสัมพันธ์มาใส่ตรงนี้
        })
        
    return output


# API สำหรับเจ้าของกดเปลี่ยนสถานะ (Confirm/Cancel)
@app.patch("/api/owner/bookings/{booking_id}/status")
async def update_booking_status(
    booking_id: int,
    status_update: dict,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(owner_only)
):
    new_status = status_update.get("status")
    owner_id = payload.get("user_id")

    # ใช้ async with db.begin() เพื่อทำ Transaction
    async with db.begin():
        # 1. ค้นหาและ Lock เฉพาะตัว Booking ก่อน (ไม่ทำ Join ตรงนี้เพื่อเลี่ยง Error)
        # เราเช็กสิทธิ์โดยการ Join ในสเต็ปนี้ได้ แต่ต้องระวังเรื่องการใช้ with_for_update
        stmt = select(models.DormBooking)\
            .join(models.Dormitory)\
            .where(models.DormBooking.id == booking_id)\
            .where(models.Dormitory.owner_id == owner_id)\
            .with_for_update(of=models.DormBooking) # 🔥 Lock เฉพาะตาราง Booking
            
        result = await db.execute(stmt)
        booking = result.scalar_one_or_none()
        
        if not booking:
            raise HTTPException(status_code=404, detail="ไม่พบข้อมูลการจอง")

        # 2. ดึงข้อมูล Dormitory แยกออกมา (เพื่อลด/เพิ่มจำนวนห้องว่าง)
        # เนื่องจากอยู่ใน Transaction เดียวกัน ข้อมูลจะถูกป้องกันไว้ระดับหนึ่งอยู่แล้ว
        dorm_stmt = select(models.Dormitory).where(models.Dormitory.id == booking.dorm_id).with_for_update()
        dorm_result = await db.execute(dorm_stmt)
        dorm = dorm_result.scalar_one_or_none()

        if not dorm:
            raise HTTPException(status_code=404, detail="ไม่พบข้อมูลหอพัก")

        old_status = booking.status

        # 3. Logic การจัดการจำนวนห้องว่าง
        # กรณีที่ 1: เปลี่ยนจากอะไรก็ได้ที่ไม่ใช่ confirmed -> เป็น confirmed
        if old_status != "confirmed" and new_status == "confirmed":
            if dorm.vacancy_count > 0:
                dorm.vacancy_count -= 1
            else:
                # ถ้าห้องเต็ม ให้ Raise Error ออกไปเลย (จะ rollback อัตโนมัติ)
                raise HTTPException(status_code=400, detail="ไม่สามารถยืนยันได้ เนื่องจากห้องว่างเต็มแล้ว")

        # กรณีที่ 2: เปลี่ยนจาก confirmed -> เป็นอย่างอื่น (ยกเลิกหรือรอ)
        elif old_status == "confirmed" and new_status != "confirmed":
            dorm.vacancy_count += 1

        # 4. อัปเดตสถานะการจอง
        booking.status = new_status
        
        # จบ block นี้จะทำการ Commit ทั้ง Booking และ Dormitory พร้อมกัน
        
    return {
        "status": "success", 
        "new_vacancy_count": dorm.vacancy_count,
        "booking_id": booking_id
    }


# ส่วน logout
@app.get("/api/auth/logout")
async def logout(response: Response, rd = Depends(get_redis), access_token: str = Cookie(None)):
    # 1. สร้างการตอบกลับแบบ Redirect ไปหน้าแรก
    res = RedirectResponse(url="/?status=logged_out")
    
    # 2. ลบคุกกี้ใน Browser (ต้องตั้งค่าให้เหมือนตอนสร้าง)
    res.delete_cookie(
        key="access_token",
        httponly=True,
        samesite="lax",
        secure=False  # ตั้งให้ตรงกับตอน login
    )
    
    # 3. (Optional) ถ้าต้องการลบ Token ใน Redis ด้วยเพื่อความเป๊ะ
    if access_token:
        try:
            token = access_token.replace("Bearer ", "")
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("user_id")
            role = payload.get("role")
            if user_id and role:
                # ลบ key ใน redis (ใช้รูปแบบเดียวกับที่เก็บใน store_token_in_redis)
                await rd.delete(f"token:{role}:{user_id}")
        except:
            pass # ถ้า Token เน่าอยู่แล้วก็ปล่อยผ่านไป

    return res

@app.get("/test-db")
async def test_db(db: AsyncSession = Depends(get_db)):
    try:
        # ลองส่งคำสั่งง่ายๆ ไปที่ Postgres
        result = await db.execute(text("SELECT 1"))
        return {"status": "Postgres is connected!", "result": result.scalar()}
    except Exception as e:
        return {"status": "Postgres connection failed", "error": str(e)}

@app.get("/test-redis")
async def test_redis(rd = Depends(get_redis)):
    try:
        # ลอง Set และ Get ค่าใน Redis
        await rd.set("test_key", "Redis is working!", ex=10)
        value = await rd.get("test_key")
        return {"status": "Redis is connected!", "value": value}
    except Exception as e:
        return {"status": "Redis connection failed", "error": str(e)}
    
