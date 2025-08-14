from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta, timezone, date
import sys, os
sys.path.append(os.path.dirname(__file__))  # 确保当前目录在模块搜索路径

import models
from database import get_db, create_tables, Task, SubTask


app = FastAPI(title="ToDoEase API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

create_tables()

@app.get("/favicon.ico")
async def favicon():
    return {"message": "No favicon"}

@app.get("/")
@app.head("/")
async def read_index():
    return FileResponse("frontend/index.html")

app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.get("/api/tasks", response_model=List[models.Task])
def get_tasks(db: Session = Depends(get_db)):
    """获取所有任务，按order_index排序"""
    tasks = db.query(Task).order_by(Task.order_index).all()
    return tasks

@app.post("/api/tasks", response_model=models.Task)
def create_task(task: models.TaskCreate, db: Session = Depends(get_db)):
    """创建新任务"""
    task_data = task.model_dump()
    if task.task_date is None:
        task_data.pop('task_date', None)  # 使用数据库默认值
    
    db_task = Task(**task_data)
    max_order = db.query(Task).count()
    db_task.order_index = max_order
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

@app.put("/api/tasks/{task_id}", response_model=models.Task)
def update_task(task_id: int, task: models.TaskUpdate, db: Session = Depends(get_db)):
    """更新任务"""
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    for field, value in task.model_dump(exclude_unset=True).items():
        setattr(db_task, field, value)
    
    db.commit()
    db.refresh(db_task)
    return db_task

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    """删除任务"""
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    db.delete(db_task)
    db.commit()
    return {"message": "Task deleted"}

@app.post("/api/tasks/{task_id}/subtasks", response_model=models.SubTask)
def create_subtask(task_id: int, subtask: models.SubTaskCreate, db: Session = Depends(get_db)):
    """为任务创建子任务"""
    db_task = db.query(Task).filter(Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    db_subtask = SubTask(**subtask.model_dump(), parent_task_id=task_id)
    max_order = db.query(SubTask).filter(SubTask.parent_task_id == task_id).count()
    db_subtask.order_index = max_order
    db.add(db_subtask)
    db.commit()
    db.refresh(db_subtask)
    return db_subtask

@app.put("/api/subtasks/{subtask_id}", response_model=models.SubTask)
def update_subtask(subtask_id: int, subtask: models.SubTaskUpdate, db: Session = Depends(get_db)):
    """更新子任务"""
    db_subtask = db.query(SubTask).filter(SubTask.id == subtask_id).first()
    if not db_subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    for field, value in subtask.model_dump(exclude_unset=True).items():
        setattr(db_subtask, field, value)
    
    db.commit()
    db.refresh(db_subtask)
    return db_subtask

@app.delete("/api/subtasks/{subtask_id}")
def delete_subtask(subtask_id: int, db: Session = Depends(get_db)):
    """删除子任务"""
    db_subtask = db.query(SubTask).filter(SubTask.id == subtask_id).first()
    if not db_subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    db.delete(db_subtask)
    db.commit()
    return {"message": "Subtask deleted"}

@app.put("/api/tasks/reorder")
def reorder_tasks(task_ids: List[int], db: Session = Depends(get_db)):
    """重新排序任务"""
    for index, task_id in enumerate(task_ids):
        db_task = db.query(Task).filter(Task.id == task_id).first()
        if db_task:
            db_task.order_index = index
    db.commit()
    return {"message": "Tasks reordered"}

@app.put("/api/tasks/{task_id}/subtasks/reorder")
def reorder_subtasks(task_id: int, subtask_ids: List[int], db: Session = Depends(get_db)):
    """重新排序子任务"""
    for index, subtask_id in enumerate(subtask_ids):
        db_subtask = db.query(SubTask).filter(
            SubTask.id == subtask_id, 
            SubTask.parent_task_id == task_id
        ).first()
        if db_subtask:
            db_subtask.order_index = index
    db.commit()
    return {"message": "Subtasks reordered"}

@app.get("/api/stats", response_model=models.TaskStats)
def get_stats(db: Session = Depends(get_db)):
    """获取任务统计信息"""
    total_tasks = db.query(Task).count()
    completed_tasks = db.query(Task).filter(Task.completed == True).count()
    completion_percentage = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
    
    return models.TaskStats(
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        completion_percentage=round(completion_percentage, 1)
    )

@app.get("/api/tasks/by-date")
def get_tasks_by_date(date: str, db: Session = Depends(get_db)):
    """
    获取指定日期的任务
    日期格式：YYYY-MM-DD
    """
    try:
        # 解析日期字符串
        target_date = datetime.strptime(date, "%Y-%m-%d").date()
        
        # 查询该日期的任务
        tasks = db.query(Task).filter(
            Task.task_date == target_date
        ).order_by(Task.order_index).all()
        
        return tasks
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format. Use YYYY-MM-DD. Error: {str(e)}")

@app.get("/api/tasks/date-range")
def get_tasks_by_date_range(start_date: str, end_date: str, db: Session = Depends(get_db)):
    """
    获取日期范围内的任务
    日期格式：YYYY-MM-DD
    """
    try:
        # 解析日期
        start = datetime.strptime(start_date, "%Y-%m-%d").date()
        end = datetime.strptime(end_date, "%Y-%m-%d").date()
        
        # 查询
        tasks = db.query(Task).filter(
            Task.task_date >= start,
            Task.task_date <= end
        ).order_by(Task.task_date.desc()).all()
        
        return tasks
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format. Use YYYY-MM-DD. Error: {str(e)}")

@app.get("/api/calendar/summary")
def get_calendar_summary(year: int, month: int, db: Session = Depends(get_db)):
    """
    获取指定月份的日历摘要（每天的任务统计）
    返回该月每天的任务总数和完成数
    """
    try:
        # 计算月份的开始和结束日期
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1)
        else:
            end_date = date(year, month + 1, 1)
        
        # 获取该月份的所有任务
        tasks = db.query(Task).filter(
            Task.task_date >= start_date,
            Task.task_date < end_date
        ).all()
        
        # 按日期统计
        daily_stats = {}
        for task in tasks:
            # 获取任务日期
            task_date = task.task_date.isoformat()
            
            if task_date not in daily_stats:
                daily_stats[task_date] = {
                    "date": task_date,
                    "total": 0,
                    "completed": 0
                }
            
            daily_stats[task_date]["total"] += 1
            if task.completed:
                daily_stats[task_date]["completed"] += 1
        
        return {
            "year": year,
            "month": month,
            "daily_stats": list(daily_stats.values())
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error getting calendar summary: {str(e)}")

@app.get("/api/stats/monthly")
def get_monthly_stats(year: int, month: int, db: Session = Depends(get_db)):
    """获取指定月份的统计信息"""
    try:
        # 计算月份的开始和结束日期
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1)
        else:
            end_date = date(year, month + 1, 1)
        
        # 获取该月份的任务
        tasks = db.query(Task).filter(
            Task.task_date >= start_date,
            Task.task_date < end_date
        ).all()
        
        total_tasks = len(tasks)
        completed_tasks = len([t for t in tasks if t.completed])
        
        return {
            "year": year,
            "month": month,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "completion_percentage": round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error getting monthly stats: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)