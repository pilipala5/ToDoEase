@echo off
setlocal

REM 1) Build Python backend (修改 package-backend.py 里的打包参数)
python package-backend.py
if errorlevel 1 goto error

REM 2) Build Electron installer (NSIS)
npm run dist:nsis
if errorlevel 1 goto error

REM 3) Optionally also output unpacked dir
REM npm run dist:dir

echo.
echo Done.
echo Installer: dist\ToDoEase-Setup-1.0.0.exe
echo Unpacked app (fastest run): dist\win-unpacked\ToDoEase.exe
pause
exit /b 0

:error
echo.
echo Build failed
pause
exit /b 1
