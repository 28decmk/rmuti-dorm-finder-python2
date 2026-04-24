from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base

class DormImage(Base):
    __tablename__ = "dorm_images"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)  # เก็บชื่อไฟล์ เช่น "dorm1_img1.jpg"
    dorm_id = Column(Integer, ForeignKey("dormitories.id"))
    
    dormitory = relationship("Dormitory", back_populates="images")