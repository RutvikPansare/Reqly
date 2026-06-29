import { app, BrowserWindow } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Reqly Desktop - thin Electron launcher around the existing `reqly start`
// server. The server is NEVER modified: it runs on localhost:4242 exactly as
// it does for CLI users. This process only spawns it (if not already running)
// and opens a chromium window pointing at it. See the architecture principle
// in docs/todo.md (M5 - Desktop App).
// ---------------------------------------------------------------------------

const SERVER_URL = 'http://localhost:4242';
const LOCK_PATH = path.join(os.homedir(), '.reqly', 'running.json');

// Reference to the server child process - only set if WE spawned it. A
// pre-existing server (started by the user via the CLI) is left untouched on
// quit, so `spawnedServer` stays null in that case.
let spawnedServer: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

// Probes the server with a single GET. Resolves true on any HTTP response
// (even a 404), false on a connection error. Used both for the initial
// "is it already running?" check and the post-spawn readiness poll.
function probeServer(): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(SERVER_URL, res => {
      res.resume();
      resolve(true);
    });
    req.setTimeout(500, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

// Reads the lock file and returns true only if it names a live process. This
// is a cheaper pre-check than an HTTP probe and avoids racing a half-started
// server. Falls back to the HTTP probe regardless.
function lockFilePointsToLiveServer(): boolean {
  try {
    const raw = fs.readFileSync(LOCK_PATH, 'utf8');
    const lock = JSON.parse(raw) as { pid?: number };
    if (!lock.pid) return false;
    process.kill(lock.pid, 0); // throws if the pid is dead
    return true;
  } catch {
    return false;
  }
}

function loadingHtml(message: string): string {
  return `data:text/html,${encodeURIComponent(`
    <html>
      <head><meta charset="utf-8" /></head>
      <body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#e4e4e7;font-family:-apple-system,Inter,system-ui,sans-serif;">
        <div style="text-align:center;">
          <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;">Reqly</div>
          <div style="margin-top:8px;font-size:13px;color:#71717a;">${message}</div>
        </div>
      </body>
    </html>`)}`;
}

async function spawnServerIfNeeded(): Promise<void> {
  const alreadyRunning = lockFilePointsToLiveServer() || (await probeServer());
  if (alreadyRunning) {
    console.log('[reqly-desktop] Server already running - reusing it.');
    return;
  }

  console.log('[reqly-desktop] No server detected - spawning `reqly start`.');
  spawnedServer = spawn('reqly', ['start'], { stdio: 'pipe', detached: false });
  spawnedServer.stdout?.on('data', d => console.log(`[reqly] ${d.toString().trim()}`));
  spawnedServer.stderr?.on('data', d => console.error(`[reqly] ${d.toString().trim()}`));
  spawnedServer.on('error', err => {
    console.error('[reqly-desktop] Failed to spawn `reqly start`:', err.message);
  });
}

// Polls the server every 200ms for up to 10s, then loads the UI. If the server
// never comes up the window stays on the loading screen with an error note.
async function waitForServerAndLoad(win: BrowserWindow): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await probeServer()) {
      await win.loadURL(SERVER_URL);
      return;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  await win.loadURL(loadingHtml('Could not reach the Reqly server on :4242. Is it installed? Try `npm i -g getreqly`.'));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0a0a0a',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  mainWindow.loadURL(loadingHtml('Starting Reqly...'));

  // Close hides the window instead of destroying it - the server keeps running
  // and the window can be reopened from the tray (T-121).
  mainWindow.on('close', e => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  waitForServerAndLoad(mainWindow);
}

app.whenReady().then(async () => {
  await spawnServerIfNeeded();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

// Quit only when explicitly told to (tray "Quit" / Cmd+Q). On macOS the app
// otherwise stays alive with no windows, matching the hide-on-close behaviour.
app.on('window-all-closed', () => {
  // Intentionally do nothing - closing the window hides it, it doesn't quit.
});

app.on('before-quit', async e => {
  isQuitting = true;

  // Only kill the server if THIS process spawned it. A user-started CLI server
  // is left running so `reqly run`/MCP sessions survive the app quitting.
  if (!spawnedServer || spawnedServer.killed) return;

  e.preventDefault();
  const child = spawnedServer;
  spawnedServer = null;

  child.kill('SIGTERM');
  const killed = await new Promise<boolean>(resolve => {
    const timer = setTimeout(() => resolve(false), 3000);
    child.on('exit', () => { clearTimeout(timer); resolve(true); });
  });
  if (!killed) child.kill('SIGKILL');

  app.quit();
});
