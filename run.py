#!/usr/bin/env python3

import subprocess
import sys
import os
from pathlib import Path

def install_requirements():
    """安装Python依赖"""
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("Python依赖安装成功")
    except subprocess.CalledProcessError as e:
        print(f"Python依赖安装失败: {e}")
        return False
    return True

def start_backend():
    """启动Python后端服务"""
    try:
        print("启动ToDoEase后端服务...")
        subprocess.run([sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"])
    except KeyboardInterrupt:
        print("\nToDoEase已停止运行")
    except Exception as e:
        print(f"启动失败: {e}")

def main():
    """主函数"""
    print("ToDoEase - 极简任务管理")
    print("=" * 40)
    
    # 检查是否安装了依赖
    if not Path("requirements.txt").exists():
        print("未找到requirements.txt文件")
        return
    
    # 安装依赖
    if not install_requirements():
        return
    
    # 启动服务
    print("\n访问地址: http://127.0.0.1:8000")
    print("按 Ctrl+C 停止服务\n")
    start_backend()

if __name__ == "__main__":
    main()