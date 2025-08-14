from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date

class SubTaskBase(BaseModel):
    title: str
    completed: bool = False
    order_index: int = 0

class SubTaskCreate(SubTaskBase):
    pass

class SubTaskUpdate(BaseModel):
    title: Optional[str] = None
    completed: Optional[bool] = None
    order_index: Optional[int] = None

class SubTask(SubTaskBase):
    id: int
    created_at: datetime
    parent_task_id: int
    
    model_config = {"from_attributes": True}

class TaskBase(BaseModel):
    title: str
    description: str = ""
    completed: bool = False
    order_index: int = 0

class TaskCreate(TaskBase):
    task_date: Optional[date] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    completed: Optional[bool] = None
    order_index: Optional[int] = None
    task_date: Optional[date] = None

class Task(TaskBase):
    id: int
    created_at: datetime
    task_date: date
    subtasks: List[SubTask] = []
    
    model_config = {"from_attributes": True}

class TaskStats(BaseModel):
    total_tasks: int
    completed_tasks: int
    completion_percentage: float