# package-backend.py
import os, shutil, sys, subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
DIST_DIR = PROJECT_ROOT / "backend_dist"          # 后端产物目录（避免与 Electron 产物递归）
BACKEND_DIR = PROJECT_ROOT / "backend"
BACKEND_ENTRY = BACKEND_DIR / "main.py"
BACKEND_NAME = "ToDoEase-Backend"

def run(cmd):
    print(">", " ".join(map(str, cmd)))
    subprocess.check_call(cmd)

def main():
    # 1) 清理旧产物
    shutil.rmtree(DIST_DIR, ignore_errors=True)
    shutil.rmtree(PROJECT_ROOT / "build" / "pyi_tmp", ignore_errors=True)

    # 2) 安装依赖（在当前环境里）
    run([sys.executable, "-m", "pip", "install", "-U", "pip", "wheel", "pyinstaller"])
    if (PROJECT_ROOT / "requirements.txt").exists():
        run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])

    # 3) PyInstaller 打包后端（onedir：启动更快；确保能找到本地模块）
    #    关键点：
    #    - 用 `-m PyInstaller` 而不是可执行名，避免 PATH 问题
    #    - --paths 指向 backend/，保证分析阶段能解析 import models/database
    #    - --hidden-import 明确包含本地模块（双保险）
    #    - --exclude-module 去掉不需要的 DB 驱动（减少警告）
    run([
        sys.executable, "-m", "PyInstaller",
        "--noconfirm", "--clean",
        f"--name={BACKEND_NAME}",
        "--onedir",                      # 不用 onefile，避免每次自解压
        "--console",                     # 需要时可看日志；Electron 启动时会隐藏窗口
        "--paths", str(BACKEND_DIR),
        "--hidden-import=models",
        "--hidden-import=database",
        "--exclude-module=pysqlite2",
        "--exclude-module=MySQLdb",
        "--exclude-module=psycopg2",
        "--workpath", "build/pyi_tmp",
        "--distpath", str(DIST_DIR),
        str(BACKEND_ENTRY)
    ])

    # 4) 拷贝前端静态资源到后端可执行目录（后端以 cwd/相对路径读取）
    out_dir = DIST_DIR / BACKEND_NAME
    fe_dir = PROJECT_ROOT / "frontend"
    if fe_dir.exists():
        shutil.copytree(fe_dir, out_dir / "frontend", dirs_exist_ok=True)

    print(f"OK: backend built at {out_dir}")

if __name__ == "__main__":
    main()
