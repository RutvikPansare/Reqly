import { app, BrowserWindow, Tray, Menu, nativeImage, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveReqly, bundledServerEntry, ResolvedReqly } from './reqly-resolver';
import { openSetupWizard } from './SetupWizard';
import { isSetupComplete } from './agent-config';

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
let tray: Tray | null = null;
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

// Reads the lock file's projectDir for the tray label. Truncated to the last
// 2 path segments so long paths don't blow out the menu width.
function readActiveProjectLabel(): string {
  try {
    const raw = fs.readFileSync(LOCK_PATH, 'utf8');
    const lock = JSON.parse(raw) as { projectDir?: string };
    if (!lock.projectDir) return 'Active project: unknown';
    const segments = lock.projectDir.split(path.sep).filter(Boolean);
    const tail = segments.slice(-2).join(path.sep);
    return `Active project: ${tail || lock.projectDir}`;
  } catch {
    return 'Active project: not running';
  }
}

function showAndFocus(): void {
  if (!mainWindow) { createWindow(); return; }
  mainWindow.show();
  mainWindow.focus();
  if (process.platform === 'darwin') app.dock?.show();
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'Open Reqly', click: showAndFocus },
    { label: readActiveProjectLabel(), enabled: false },
    { type: 'separator' },
    { label: 'AI Agent Connections...', click: () => openSetupWizard() },
    { type: 'separator' },
    {
      label: 'Launch at login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => { app.setLoginItemSettings({ openAtLogin: item.checked }); },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}

function createTray(): void {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('Reqly');
  tray.setContextMenu(buildTrayMenu());

  // Rebuild on every click so the active-project label is never stale - the
  // user may have switched projects (via the UI or another CLI session)
  // since the menu was last opened.
  tray.on('click', () => {
    tray?.setContextMenu(buildTrayMenu());
    showAndFocus();
  });
  tray.on('double-click', showAndFocus);
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

// T-233: the server command is resolved with a priority chain instead of
// requiring a pre-installed CLI: Homebrew CLI > npm CLI on PATH > the binary
// bundled inside this app. Non-technical users who only downloaded the DMG
// get the bundled fallback; developers with the CLI keep using it so
// `brew upgrade` / `npm update -g` keeps their agents current.
let serverMissing = false;

async function spawnServerIfNeeded(): Promise<void> {
  const alreadyRunning = lockFilePointsToLiveServer() || (await probeServer());
  if (alreadyRunning) {
    console.log('[reqly-desktop] Server already running - reusing it.');
    return;
  }

  const resolved: ResolvedReqly | null = resolveReqly();
  if (!resolved) {
    console.error('[reqly-desktop] No reqly server found: no CLI on PATH, no bundled binary.');
    serverMissing = true;
    return;
  }

  console.log(`[reqly-desktop] No server detected - starting via ${resolved.display}.`);
  if (resolved.kind === 'bundled') {
    // Run the bundled server with this Electron binary in Node mode. Spawning
    // process.execPath directly (instead of the bin/ shim) keeps stdio wiring
    // identical across platforms; the shim exists for AI agent configs.
    spawnedServer = spawn(process.execPath, [bundledServerEntry()], {
      stdio: 'pipe',
      detached: false,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', REQLY_DESKTOP: '1' },
    });
  } else {
    spawnedServer = spawn(resolved.command, ['start'], {
      stdio: 'pipe',
      detached: false,
      env: { ...process.env, REQLY_DESKTOP: '1' },
    });
  }
  spawnedServer.stdout?.on('data', d => console.log(`[reqly] ${d.toString().trim()}`));
  spawnedServer.stderr?.on('data', d => console.error(`[reqly] ${d.toString().trim()}`));
  spawnedServer.on('error', err => {
    console.error('[reqly-desktop] Failed to spawn the reqly server:', err.message);
  });
}

// Polls the server every 200ms for up to 10s, then loads the UI. If the server
// never comes up the window stays on the loading screen with an error note.
async function waitForServerAndLoad(win: BrowserWindow): Promise<void> {
  if (serverMissing) {
    await win.loadURL(loadingHtml('No Reqly server found (bundled binary missing and no CLI installed). Reinstall the app, or run: npm install -g getreqly'));
    return;
  }

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
    backgroundColor: '#0f0f12', // Matches var(--surface-1)
    titleBarStyle: 'hiddenInset',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
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

// Syncs the OS "launch at login" registration with the user's stored
// preference in ~/.reqly/config.json (set via the Settings UI toggle, T-122).
// Runs on every startup so the OS state never drifts from the saved choice.
function syncLoginItemFromConfig(): void {
  try {
    const configPath = path.join(os.homedir(), '.reqly', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    app.setLoginItemSettings({ openAtLogin: !!cfg.launchAtLogin });
  } catch {
    // No config yet - leave the OS default (not registered) untouched.
  }
}

autoUpdater.on('update-downloaded', async () => {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    message: 'Update downloaded. Restart now?',
    buttons: ['Restart', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) autoUpdater.quitAndInstall();
});

app.whenReady().then(async () => {
  syncLoginItemFromConfig();
  await spawnServerIfNeeded();
  createWindow();
  createTray();
  if (process.platform === 'darwin') app.dock?.hide();

  // First launch: walk the user through connecting their AI agents (T-233).
  // Suppressed once the wizard is completed or skipped (setupComplete flag);
  // reachable again from the tray menu at any time.
  if (!isSetupComplete()) openSetupWizard();

  // Checks GitHub Releases for a newer DMG/EXE build and downloads it in the
  // background. Never restarts without explicit consent - 'update-downloaded'
  // below shows a Restart/Later dialog and only calls quitAndInstall() if the
  // user clicks Restart. npm-global installs (`npm i -g getreqly`) are NOT
  // covered by this - they get updates via `npm update -g`. Do not remove
  // this call thinking it's redundant with that path; the two are
  // independent distribution channels.
  autoUpdater.checkForUpdates().catch(err => {
    console.error('[reqly-desktop] Update check failed:', err.message);
  });

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

app.on('before-quit', e => {
  if (isQuitting) return;
  isQuitting = true;

  // Only kill the server if THIS process spawned it.
  if (!spawnedServer || spawnedServer.killed) return;

  e.preventDefault();
  const child = spawnedServer;
  spawnedServer = null;

  child.kill('SIGTERM');
  
  // If the server exits quickly, exit the app. Otherwise force kill after 1s.
  // Using app.exit(0) instead of app.quit() to avoid macOS async event loop drops.
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    app.exit(0);
  }, 1000);

  child.on('exit', () => {
    clearTimeout(timer);
    app.exit(0);
  });
});
