// electron/main.js
const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
// 禁用 HTTP 缓存（开发/打包都生效）
app.commandLine.appendSwitch('disable-http-cache');

let mainWindow;
let pythonProcess;
const isDev = !app.isPackaged;
const BACKEND_URL = 'http://127.0.0.1:8000';

function waitForServer(url, timeoutMs = 60000, interval = 300) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const ping = () => {
      const req = http.get(url, (res) => { res.resume(); resolve(); });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('Backend not ready in time'));
        else setTimeout(ping, interval);
      });
    };
    ping();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    icon: path.join(__dirname, '../assets/icon.png'),
    titleBarStyle: 'default',
    show: true
  });

  Menu.setApplicationMenu(null);

  // splash
  const splashPath = path.join(__dirname, 'splash.html');
  if (fs.existsSync(splashPath)) {
    mainWindow.loadFile(splashPath).catch(() => {});
  } else {
    const inline = `
      <!doctype html><html><head><meta charset="utf-8">
      <title>ToDoEase</title>
      <style>html,body{height:100%;margin:0;font-family:system-ui,Arial}
      .w{height:100%;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0}
      .c{padding:24px 28px;border-radius:14px;background:#111827;box-shadow:0 10px 30px rgba(0,0,0,.35);text-align:center}
      .s{width:30px;height:30px;border:3px solid #475569;border-top-color:transparent;border-radius:50%;margin:14px auto;animation:spin 1s linear infinite}
      @keyframes spin{to{transform:rotate(360deg)}}</style></head>
      <body><div class="w"><div class="c"><div>ToDoEase</div><div class="s"></div><div>Starting backend...</div></div></div></body></html>
    `;
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(inline));
  }

  // wait then switch
  // wait then switch（清缓存 + 加时间戳防缓存）
  waitForServer(BACKEND_URL, 60000, 300)
    .then(async () => {
      try {
        // 清理缓存与 ServiceWorker/caches
        await mainWindow.webContents.session.clearCache();
        await mainWindow.webContents.session.clearStorageData({
          storages: ['serviceworkers', 'caches']
        });
      } catch (e) {
        // 忽略清理异常，继续加载
        console.warn('clear cache error:', e);
      }
      // 加上时间戳参数，确保 index.html 不被缓存
      const urlWithTs = `${BACKEND_URL}?t=${Date.now()}`;
      return mainWindow.loadURL(urlWithTs);
    })
    .catch((err) => {
      dialog.showErrorBox('Backend failed to start', (err && err.message) || String(err));
    });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function startPythonBackend() {
  if (isDev) {
    const py = process.platform === 'win32' ? 'python' : 'python3';
    pythonProcess = spawn(py, ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8000'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      shell: false
    });
    return;
  }

  // packaged
  const resourcesDir = process.resourcesPath; // .../win-unpacked/resources  或 安装目录/resources
  const backendDir = path.join(resourcesDir, 'backend');

  // exe 可能在两种位置： 1) backend/ToDoEase-Backend.exe  2) backend/ToDoEase-Backend/ToDoEase-Backend.exe
  const exeCandidates = [
    path.join(backendDir, 'ToDoEase-Backend.exe'),
    path.join(backendDir, 'ToDoEase-Backend', 'ToDoEase-Backend.exe')
  ];
  const exePath = exeCandidates.find(p => fs.existsSync(p));

  // 可写目录（安装版 = userData；便携单文件 = PORTABLE_EXECUTABLE_DIR）
  const dataDir = process.env.PORTABLE_EXECUTABLE_DIR || app.getPath('userData');
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}

  // 日志落盘
  const logFile = path.join(dataDir, 'backend.log');
  const out = fs.createWriteStream(logFile, { flags: 'a' });

  if (!exePath) {
    const msg = `Backend executable not found.\nTried:\n - ${exeCandidates.join('\n - ')}\nresourcesDir=${resourcesDir}`;
    out.write(`[${new Date().toISOString()}] ${msg}\n`);
    dialog.showErrorBox('Backend missing', msg);
    return;
  }

  // 启动后端并把日志写到 backend.log
  try {
    pythonProcess = spawn(exePath, [], {
      cwd: path.dirname(exePath).includes('ToDoEase-Backend') ? path.dirname(exePath) : backendDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
      env: { ...process.env, TODOEASE_DATA_DIR: dataDir }
    });

    pythonProcess.stdout.on('data', d => out.write(d));
    pythonProcess.stderr.on('data', d => out.write(d));
    pythonProcess.on('error', (e) => {
      out.write(`[${new Date().toISOString()}] spawn error: ${e && e.stack || e}\n`);
      dialog.showErrorBox('Backend error', (e && e.message) || String(e));
    });
    pythonProcess.on('exit', (code, signal) => {
      out.write(`[${new Date().toISOString()}] exit code=${code} signal=${signal}\n`);
    });
  } catch (e) {
    out.write(`[${new Date().toISOString()}] spawn threw: ${e && e.stack || e}\n`);
    dialog.showErrorBox('Backend start failed', (e && e.message) || String(e));
  }
}

app.whenReady().then(() => {
  startPythonBackend();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  try { if (pythonProcess && !pythonProcess.killed) pythonProcess.kill(); } catch {}
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { if (pythonProcess && !pythonProcess.killed) pythonProcess.kill(); } catch {}
});
