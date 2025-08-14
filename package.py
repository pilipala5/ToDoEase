#!/usr/bin/env python3
"""
ToDoEase 单文件可执行程序打包
用户拿到后直接双击运行即可使用
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

def package_app():
    """创建单文件可执行程序"""
    
    # 清理旧构建
    for folder in ['dist', 'build']:
        if os.path.exists(folder):
            shutil.rmtree(folder)
    
    print("📦 开始创建单文件应用...")
    
    # 使用PyInstaller创建单文件exe
    cmd = [
        sys.executable, '-m', 'PyInstaller',
        '--onefile',  # 单文件模式
        '--noconfirm', '--clean',
        '--name', 'ToDoEase',  # 输出文件名
        '--distpath', 'dist',
        '--workpath', 'build',
        '--specpath', 'build',
        '--add-data', 'frontend;frontend',
        '--add-data', 'assets;assets',
        '--add-data', 'backend;backend',
        '--hidden-import', 'backend.database',
        '--hidden-import', 'backend.models',
        '--hidden-import', 'fastapi',
        '--hidden-import', 'uvicorn',
        '--hidden-import', 'sqlalchemy',
        '--hidden-import', 'sqlite3',
        # 排除大模块减小体积
        '--exclude-module', 'matplotlib',
        '--exclude-module', 'pandas',
        '--exclude-module', 'numpy',
        '--exclude-module', 'pytest',
        '--exclude-module', 'test',
        # 优化启动速度
        '--bootloader-ignore-signals',
        # 压缩
        '--upx-dir', 'C:\\Program Files\\upx' if os.name == 'nt' else '',
        'run-complete.py'  # 新的启动文件
    ]
    
    # 如果没有upx，移除upx参数
    if not os.path.exists('C:\\Program Files\\upx'):
        cmd = [x for x in cmd if not x.startswith('--upx-dir')]
    
    try:
        subprocess.run(cmd, check=True)
        print("✅ 单文件应用创建完成!")
        print(f"📁 文件路径: dist{os.sep}ToDoEase.exe")
        print("🎯 用户双击即可运行")
        return f"dist{os.sep}ToDoEase.exe"
    except subprocess.CalledProcessError as e:
        print(f"❌ 打包失败: {e}")
        return None

if __name__ == "__main__":
    package_app()