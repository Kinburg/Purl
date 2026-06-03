import {app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, screen, shell} from 'electron';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

// `localfile://` must be a privileged scheme so it can be loaded as a subresource
// from a browsing context whose origin differs from the renderer — e.g. the
// sandboxed Play-panel iframe. Without this, `<img src="localfile://…">` works in
// the main window but is silently blocked inside the iframe. Must run before the
// app `ready` event, so it lives at module top.
protocol.registerSchemesAsPrivileged([
  // Do NOT set `standard: true` — it makes Chromium parse `localfile:///D:/…` as a
  // standard URL and hoist the Windows drive letter into the host (`localfile://d/…`),
  // which breaks every localfile path (editor + iframe). `secure` alone is enough to
  // let the sandboxed Play iframe load `localfile://` images as a no-cors subresource,
  // and it leaves the (non-standard) URL parsing exactly as it was before.
  {
    scheme: 'localfile',
    privileges: { secure: true, bypassCSP: true },
  },
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

// Required for correct taskbar grouping and icon on Windows 10/11
app.setAppUserModelId('com.purlapp.app');

// Prevent GPU compositor crashes (STATUS_FATAL_APP_EXIT / 0xC000041D) on Windows.
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');

if (process.argv.includes('--disable-gpu')) {
  app.disableHardwareAcceleration();
}

let isQuitting = false;
app.on('before-quit', () => { isQuitting = true; });

app.on('child-process-gone', (_event, details) => {
  if (!isQuitting && details.type === 'GPU' && details.reason !== 'clean-exit') {
    app.relaunch({ args: process.argv.slice(1).concat(['--disable-gpu']) });
  }
});

// Projects stored in ~/Documents/Purl/Projects/
const PROJECTS_DIR = path.join(app.getPath('documents'), 'Purl', 'Projects');

// ─── App config (title bar style + window layout) ───────────────────────────

type TitleBarStyle = 'custom' | 'native';

interface WindowBoundsRel {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  isMaximized: boolean;
}

interface WindowLayoutSet {
  main?: WindowBoundsRel;
}

interface AppConfig {
  titleBarStyle: TitleBarStyle;
  windowLayout?: WindowLayoutSet;
}

let appConfig: AppConfig = { titleBarStyle: 'custom' };
let appConfigPath = '';

async function loadAppConfig(): Promise<void> {
  appConfigPath = path.join(app.getPath('userData'), 'purl-config.json');
  try {
    const raw = await fs.readFile(appConfigPath, 'utf-8');
    appConfig = { titleBarStyle: 'custom', ...JSON.parse(raw) };
  } catch { /* first run — defaults apply */ }
}

async function saveAppConfig(patch: Partial<AppConfig>): Promise<void> {
  appConfig = { ...appConfig, ...patch };
  await fs.writeFile(appConfigPath, JSON.stringify(appConfig, null, 2), 'utf-8');
}

// ─── Window bounds ↔ relative conversion ────────────────────────────────────

interface MinSize { minWidth: number; minHeight: number }

function boundsToRel(bounds: Electron.Rectangle, isMaximized: boolean): WindowBoundsRel {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  return {
    xPct: bounds.x / sw,
    yPct: bounds.y / sh,
    widthPct: bounds.width / sw,
    heightPct: bounds.height / sh,
    isMaximized,
  };
}

function relToBounds(rel: WindowBoundsRel, min: MinSize): Electron.Rectangle & { isMaximized: boolean } {
  const workArea = screen.getPrimaryDisplay().workArea;
  const sw = workArea.width;
  const sh = workArea.height;

  const w = Math.max(Math.round(rel.widthPct * sw), min.minWidth);
  const h = Math.max(Math.round(rel.heightPct * sh), min.minHeight);

  let x = Math.round(rel.xPct * sw) + workArea.x;
  let y = Math.round(rel.yPct * sh) + workArea.y;

  if (x + w > workArea.x + sw) x = workArea.x + sw - w;
  if (y + h > workArea.y + sh) y = workArea.y + sh - h;
  if (x < workArea.x) x = workArea.x;
  if (y < workArea.y) y = workArea.y;

  return { x, y, width: w, height: h, isMaximized: rel.isMaximized };
}

// ─── Debounced window bounds tracking ────────────────────────────────────────

const SAVE_DEBOUNCE_MS = 500;
const boundsTimers = new Map<string, ReturnType<typeof setTimeout>>();

function trackWindowBounds(bw: BrowserWindow, key: 'main') {
  const save = () => {
    if (bw.isDestroyed() || bw.isMinimized()) return;
    const isMax = bw.isMaximized();
    if (isMax) {
      const current = appConfig.windowLayout?.[key];
      if (current) {
        appConfig.windowLayout = {
          ...appConfig.windowLayout,
          [key]: { ...current, isMaximized: true },
        };
      }
    } else {
      appConfig.windowLayout = {
        ...appConfig.windowLayout,
        [key]: boundsToRel(bw.getBounds(), false),
      };
    }
    saveAppConfig({});
  };

  const debouncedSave = () => {
    const existing = boundsTimers.get(key);
    if (existing) clearTimeout(existing);
    boundsTimers.set(key, setTimeout(save, SAVE_DEBOUNCE_MS));
  };

  bw.on('move', debouncedSave);
  bw.on('resize', debouncedSave);
}

let win: BrowserWindow | null;
let splashWin: BrowserWindow | null = null;
let splashStart = 0;

// ─── Animation Helper ─────────────────────────────────────────────────────────

async function fadeWindow(bw: BrowserWindow, from: number, to: number, duration: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const currentOpacity = from + (to - from) * progress;
      
      if (!bw.isDestroyed()) {
        bw.setOpacity(currentOpacity);
      }

      if (progress >= 1) {
        clearInterval(timer);
        resolve();
      }
    }, 16); // ~60fps
  });
}

// ─── Splash window ────────────────────────────────────────────────────────────

function createSplashWindow() {
  splashWin = new BrowserWindow({
    width: 704,
    height: 480,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  
  splashWin.loadFile(path.join(process.env.VITE_PUBLIC!, 'splash.html'));

  splashWin.webContents.on('dom-ready', () => {
    const version = app.getVersion();
    splashWin?.webContents.executeJavaScript(`
      const el = document.getElementById('version');
      if (el) el.innerText = 'v${version}';
    `).catch(() => {});
  });

  splashWin.once('ready-to-show', () => {
    splashWin?.setOpacity(0);
    splashWin?.show();
    fadeWindow(splashWin!, 0, 1, 200);
  });
}

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  const iconPath = path.join(process.env.VITE_PUBLIC!, 'Icon.ico');
  const frameless = appConfig.titleBarStyle === 'custom';
  const MIN = { minWidth: 1300, minHeight: 600 };
  const saved = appConfig.windowLayout?.main;
  const restored = saved ? relToBounds(saved, MIN) : null;

  win = new BrowserWindow({
    width: restored?.width ?? 1400,
    height: restored?.height ?? 900,
    ...(restored ? { x: restored.x, y: restored.y } : {}),
    minWidth: MIN.minWidth,
    minHeight: MIN.minHeight,
    title: 'Purl',
    show: false,
    opacity: 0, // Start fully transparent
    frame: !frameless,
    backgroundColor: '#0f172a',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // win.webContents.openDevTools();

  // Fix WebSocket handshake Origin for local services (e.g. ComfyUI).
  // Electron renderer sends an Origin that ComfyUI doesn't recognise → 403.
  // Rewrite Origin to match the target so the server accepts the upgrade.
  win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    if (details.url.startsWith('ws://') || details.url.startsWith('wss://')) {
      try {
        const httpUrl = details.url.replace(/^ws(s?):/, 'http$1:');
        details.requestHeaders['Origin'] = new URL(httpUrl).origin;
      } catch { /* leave as-is */ }
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  trackWindowBounds(win, 'main');

  if (frameless) {
    win.on('maximize',   () => win?.webContents.send('window:maximized', true));
    win.on('unmaximize', () => win?.webContents.send('window:maximized', false));
  }

  // Intercept close to allow renderer to confirm / save first
  let closeConfirmed = false;
  win.on('close', (e) => {
    if (win && !win.isDestroyed()) {
      appConfig.windowLayout = {
        ...appConfig.windowLayout,
        main: boundsToRel(win.getBounds(), win.isMaximized()),
      };
      saveAppConfig({});
    }
    if (!closeConfirmed) {
      e.preventDefault();
      win?.webContents.send('app:close-requested');
    }
  });

  ipcMain.removeAllListeners('app:close-confirm');
  ipcMain.removeAllListeners('app:close-cancel');

  ipcMain.on('app:close-confirm', () => {
    closeConfirmed = true;
    win?.close();
  });
  ipcMain.on('app:close-cancel', () => { /* do nothing — close already prevented */ });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  win.on('closed', () => {
    win = null;
  });

  win.once('ready-to-show', () => {
    const elapsed = Date.now() - splashStart;
    const delay = Math.max(0, 2000 - elapsed);
    
    setTimeout(async () => {
      // 1. Fill progress bar to 100%
      if (splashWin && !splashWin.isDestroyed()) {
        splashWin.webContents.executeJavaScript(`
          const bar = document.getElementById('progress-bar');
          if (bar) { bar.style.transition = 'width 0.2s ease-in'; bar.style.width = '100%'; }
        `).catch(() => {});
        
        // Wait for bar animation to finish
        await new Promise(r => setTimeout(r, 200));

        // 2. Fade out splash
        await fadeWindow(splashWin, 1, 0, 200);
        splashWin.hide();
      }

      // 3. Short pause for cleaner transition
      await new Promise(r => setTimeout(r, 200));

      // 4. Show and Fade in main window
      if (win && !win.isDestroyed()) {
        if (restored?.isMaximized !== false) {
          win.maximize();
        } else {
          win.show();
        }
        await fadeWindow(win, 0, 1, 200);
      }

      // Cleanup splash
      if (splashWin && !splashWin.isDestroyed()) {
        splashWin.destroy();
        splashWin = null;
      }
    }, delay);
  });
}

// ─── Custom protocol for local asset display ──────────────────────────────────

app.whenReady().then(async () => {
  await loadAppConfig();

  if (appConfig.titleBarStyle === 'custom') {
    Menu.setApplicationMenu(null);
  }

  protocol.handle('localfile', (request) => {
    const filePath = decodeURIComponent(request.url.replace('localfile://', ''));
    return net.fetch('file://' + filePath);
  });

  fs.mkdir(PROJECTS_DIR, { recursive: true }).catch(() => {});

  splashStart = Date.now();
  createSplashWindow();
  createWindow();
});

// ─── IPC: filesystem ─────────────────────────────────────────────────────────

ipcMain.handle('fs:getProjectsDir', () => PROJECTS_DIR);
ipcMain.handle('fs:getExampleWorkflowsDir', () =>
  VITE_DEV_SERVER_URL
    ? path.join(process.env.APP_ROOT!, 'resources', 'example-workflows')
    : path.join(process.resourcesPath, 'example-workflows')
);

ipcMain.handle('fs:readFile', async (_e, filePath: string) => {
  return fs.readFile(filePath, 'utf-8');
});

ipcMain.handle('fs:readFileBinary', async (_e, filePath: string) => {
  const buf = await fs.readFile(filePath);
  return Array.from(buf);
});

ipcMain.handle('fs:writeFile', async (_e, filePath: string, content: string) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
});

ipcMain.handle('fs:writeFileBinary', async (_e, filePath: string, bytes: number[]) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(bytes));
});

ipcMain.handle('fs:copyFile', async (_e, src: string, dest: string) => {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
});

ipcMain.handle('fs:mkdir', async (_e, dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
});

ipcMain.handle('fs:exists', async (_e, filePath: string) => {
  try { await fs.access(filePath); return true; } catch { return false; }
});

ipcMain.handle('fs:rename', async (_e, oldPath: string, newPath: string) => {
  await fs.rename(oldPath, newPath);
});

ipcMain.handle('fs:listDir', async (_e, dirPath: string) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map(e => ({ name: e.name, isDir: e.isDirectory() }));
  } catch { return []; }
});

ipcMain.handle('fs:deleteFile', async (_e, filePath: string) => {
  await fs.unlink(filePath);
});

ipcMain.handle('fs:deleteDir', async (_e, dirPath: string) => {
  await fs.rm(dirPath, { recursive: true, force: true });
});

ipcMain.handle('fs:stat', async (_e, filePath: string) => {
  const st = await fs.stat(filePath);
  return { size: st.size, mtimeMs: st.mtimeMs };
});

// ─── IPC: dialogs ─────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async (_e, options: Electron.OpenDialogOptions) => {
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, { properties: ['openFile'], ...options });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:openFiles', async (_e, options: Electron.OpenDialogOptions) => {
  if (!win) return [];
  const result = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], ...options });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('dialog:openFolder', async () => {
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_e, options: Electron.SaveDialogOptions) => {
  if (!win) return null;
  const result = await dialog.showSaveDialog(win, options);
  return result.canceled ? null : result.filePath ?? null;
});

// ─── IPC: shell ───────────────────────────────────────────────────────────────

ipcMain.handle('shell:openPath', async (_e, filePath: string) => {
  await shell.openPath(filePath);
});

// ─── IPC: HTTP proxy (for local services like ComfyUI) ───────────────────────

ipcMain.handle('http:request', async (_e, req: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) => {
  const res = await fetch(req.url, {
    method: req.method ?? 'GET',
    headers: req.headers,
    body: req.body,
  });
  const text = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => { headers[key] = value; });
  return { status: res.status, headers, text };
});

ipcMain.handle('http:requestBinary', async (_e, req: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) => {
  // net.fetch handles custom Electron protocols (e.g. localfile://); native fetch does not
  const fetcher = req.url.startsWith('localfile://') ? net.fetch : fetch;
  const res = await fetcher(req.url, {
    method: req.method ?? 'GET',
    headers: req.headers,
    body: req.body,
  });
  const buf = new Uint8Array(await res.arrayBuffer());
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => { headers[key] = value; });
  return { status: res.status, headers, bytes: Array.from(buf) };
});

// ─── IPC: window controls ─────────────────────────────────────────────────────

ipcMain.handle('window:minimize',    (e) => { BrowserWindow.fromWebContents(e.sender)?.minimize(); });
ipcMain.handle('window:maximize',    (e) => {
  const bw = BrowserWindow.fromWebContents(e.sender);
  if (!bw) return;
  if (bw.isMaximized()) bw.unmaximize(); else bw.maximize();
});
ipcMain.handle('window:close',       (e) => { BrowserWindow.fromWebContents(e.sender)?.close(); });
ipcMain.handle('window:isMaximized', (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false);

// ─── IPC: app config ──────────────────────────────────────────────────────────

ipcMain.handle('config:getTitleBarStyle', () => appConfig.titleBarStyle);
ipcMain.on('config:getTitleBarStyleSync', (e) => { e.returnValue = appConfig.titleBarStyle; });

ipcMain.handle('config:setTitleBarStyle', async (_e, style: TitleBarStyle) => {
  await saveAppConfig({ titleBarStyle: style });
  app.relaunch();
  app.exit(0);
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && win === null) {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
