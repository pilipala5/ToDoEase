from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Date, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime, date

# --- 可写数据目录：优先用 Electron 传入的 TODOEASE_DATA_DIR，兜底 ~/.todoease ---
import os
from pathlib import Path

data_dir = os.environ.get("TODOEASE_DATA_DIR")
if not data_dir:
    data_dir = str((Path.home() / ".todoease").resolve())

Path(data_dir).mkdir(parents=True, exist_ok=True)
SQLITE_DATABASE_URL = "sqlite:///" + str(Path(data_dir) / "todoease.db").replace("\\", "/")

# --- SQLAlchemy ---
engine = create_engine(SQLITE_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- 模型 ---
class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, default="")
    completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    task_date = Column(Date, default=date.today)
    order_index = Column(Integer, default=0)
    subtasks = relationship("SubTask", back_populates="parent_task", cascade="all, delete-orphan")

class SubTask(Base):
    __tablename__ = "subtasks"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    order_index = Column(Integer, default=0)
    parent_task_id = Column(Integer, ForeignKey("tasks.id"))
    parent_task = relationship("Task", back_populates="subtasks")

# --- 初始化工具 ---
def create_tables():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
