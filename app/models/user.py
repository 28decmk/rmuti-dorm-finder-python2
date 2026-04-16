from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship  # <<< เพิ่มบรรทัดนี้
from datetime import datetime
from ..database import Base

class Admin(Base):
    __tablename__ = "admins"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False) # เพิ่ม email
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Owner(Base):
    __tablename__ = "owners"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    
    # แก้ไข/เพิ่ม ให้ตรงกับที่เรียกใน main.py
    first_name = Column(String)  # เพิ่ม
    last_name = Column(String)   # เพิ่ม
    phone = Column(String)        # เปลี่ยนจาก phone_number เป็น phone ให้ตรงกับ Schema
    
    dorm_name = Column(String)
    is_active = Column(Boolean, default=True)
    is_approved = Column(Boolean, default=False) # เพิ่มสำหรับระบบอนุมัติ
    
    created_at = Column(DateTime, default=datetime.utcnow)
    dorms = relationship("Dormitory", back_populates="owner")