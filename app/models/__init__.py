from ..database import Base
from .user import Base, Admin, Owner  # แก้บรรทัดนี้
from .dormitory import Dormitory, DormitoryDraft, DormViewLog, DormBooking, RoomType, RoomTypeImage
from .dorm_image import DormImage

# รวบรวมไว้เพื่อให้เข้าถึงง่ายจากภายนอก
__all__ = ["Base", "User", "Dormitory", "DormitoryDraft", "DormImage", "DormViewLog", "DormBooking", "RoomType", "RoomTypeImage"]