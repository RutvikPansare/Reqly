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
import { log, LOG_PATH } from './logger';

// ---------------------------------------------------------------------------
// Reqly Desktop - thin Electron launcher around the existing `reqly start`
// server. The server is NEVER modified: this process only spawns it (if not
// already running) and opens a chromium window pointing at it. See the
// architecture principle in docs/todo.md (M5 - Desktop App).
//
// Port isolation (T-257): Electron's server gets an OS-assigned ephemeral
// port (`REQLY_ELECTRON=1` makes `index.ts` target port 0) so it runs
// independently of any agent server already on 4242. Since the port isn't
// known ahead of time, this process reads it back out of the shared lock
// file (~/.reqly/running.json, written by the server after it binds) rather
// than assuming a fixed URL - see `resolveElectronPort` below.
//
// Resilience contract (T-240): the window must never sit on a dead blank
// page. Every failure mode - renderer crash, failed load, server death - is
// logged to ~/.reqly/desktop.log and answered with an automatic recovery
// (reload, reconnect loop, or server respawn).
// ---------------------------------------------------------------------------

const LOCK_PATH = path.join(os.homedir(), '.reqly', 'running.json');

// Reference to the server child process - only set if WE spawned it. A
// pre-existing server (started by the user via the CLI) is left untouched on
// quit, so `spawnedServer` stays null in that case.
let spawnedServer: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// The port the currently-live Electron-owned server is bound to. Resolved
// after spawn (or reuse) via `resolveElectronPort`; null means "not known
// yet" (server missing, or lock file not written yet).
let activePort: number | null = null;

function serverUrl(port: number): string {
  return `http://localhost:${port}`;
}

// The main process itself must never die silently: log and keep running.
process.on('uncaughtException', err => {
  log.error(`Uncaught exception in main process: ${err.stack || err.message}`);
});
process.on('unhandledRejection', reason => {
  const detail = reason instanceof Error ? reason.stack || reason.message : String(reason);
  log.error(`Unhandled rejection in main process: ${detail}`);
});

// Probes a server with a single GET. Resolves true on any HTTP response
// (even a 404), false on a connection error. Used both for the initial
// "is it already running?" check and the post-spawn readiness poll.
function probeServer(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(serverUrl(port), res => {
      res.resume();
      resolve(true);
    });
    req.setTimeout(500, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

interface RunningLock {
  pid: number;
  projectDir: string;
  port: number;
  startedAt: string;
  type: 'electron' | 'agent';
}

function readRunningLock(): RunningLock | null {
  try {
    const raw = fs.readFileSync(LOCK_PATH, 'utf8');
    return JSON.parse(raw) as RunningLock;
  } catch {
    return null;
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Reads the lock file's projectDir for the tray label. Truncated to the last
// 2 path segments so long paths don't blow out the menu width.
function readActiveProjectLabel(): string {
  const lock = readRunningLock();
  if (!lock?.projectDir) return 'Active project: not running';
  const segments = lock.projectDir.split(path.sep).filter(Boolean);
  const tail = segments.slice(-2).join(path.sep);
  return `Active project: ${tail || lock.projectDir}`;
}

// Polls the lock file until it reflects a live Electron-owned server on the
// expected pid (when given - the server we just spawned writes its OWN pid,
// not this Electron process's pid, once it binds its ephemeral port). With
// no pid filter, resolves against whatever live Electron lock is present -
// used for the initial "is one already running?" check.
async function resolveElectronPort(expectedPid?: number, timeoutMs = 15_000): Promise<number | null> {
  const start = Date.now();
  do {
    const lock = readRunningLock();
    if (lock && lock.type === 'electron' && isPidAlive(lock.pid) && (!expectedPid || lock.pid === expectedPid)) {
      return lock.port;
    }
    await new Promise(r => setTimeout(r, 150));
  } while (Date.now() - start < timeoutMs);
  return null;
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
        <div style="text-align:center;max-width:520px;">
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

// Server respawn budget: reset after a stable minute of uptime so a one-off
// crash gets unlimited retries over a session, but a server that dies on
// every boot can't hot-loop the machine.
const MAX_RESPAWNS_PER_WINDOW = 5;
let respawnTimestamps: number[] = [];

function respawnBudgetExhausted(): boolean {
  const now = Date.now();
  respawnTimestamps = respawnTimestamps.filter(t => now - t < 10 * 60_000);
  return respawnTimestamps.length >= MAX_RESPAWNS_PER_WINDOW;
}

// Resolves with the port the Electron-owned server is reachable on, or null
// if none could be found or spawned. Never assumes a fixed port - Electron's
// server binds an OS-assigned ephemeral port (T-257), so the real port always
// comes from either an existing live lock or a poll of the lock file the
// freshly-spawned child writes after it binds.
async function spawnServerIfNeeded(): Promise<number | null> {
  // Check for an already-live Electron-owned server via the lock file first,
  // then confirm with an HTTP probe. A lock-file pid check alone would pass
  // for a zombie (process alive, port never bound - e.g. it lost the startup
  // race), so the probe is what actually decides reuse (T-256).
  const existingPort = await resolveElectronPort(undefined, 0);
  if (existingPort && await probeServer(existingPort)) {
    log.info(`Server already running on port ${existingPort} - reusing it.`);
    return existingPort;
  }

  const resolved: ResolvedReqly | null = resolveReqly();
  if (!resolved) {
    log.error('No reqly server found: no CLI on PATH, no bundled binary.');
    serverMissing = true;
    return null;
  }

  log.info(`No server detected - starting via ${resolved.display}.`);
  respawnTimestamps.push(Date.now());
  if (resolved.kind === 'bundled') {
    // Run the bundled server with this Electron binary in Node mode. Spawning
    // process.execPath directly (instead of the bin/ shim) keeps stdio wiring
    // identical across platforms; the shim exists for AI agent configs.
    spawnedServer = spawn(process.execPath, [bundledServerEntry()], {
      stdio: 'pipe',
      detached: false,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', REQLY_DESKTOP: '1', REQLY_ELECTRON: '1' },
    });
  } else {
    spawnedServer = spawn(resolved.command, ['start'], {
      stdio: 'pipe',
      detached: false,
      env: { ...process.env, REQLY_DESKTOP: '1', REQLY_ELECTRON: '1' },
    });
  }
  const child = spawnedServer;
  child.stdout?.on('data', d => log.info(`[reqly] ${d.toString().trim()}`));
  child.stderr?.on('data', d => log.error(`[reqly] ${d.toString().trim()}`));
  child.on('error', err => {
    log.error(`Failed to spawn the reqly server: ${err.message}`);
  });
  child.on('exit', (code, signal) => {
    if (isQuitting) return;
    log.error(`Server process exited unexpectedly (code=${code} signal=${signal}). Watchdog will respawn it.`);
    if (spawnedServer === child) spawnedServer = null;
  });

  // The child's pid, not this process's pid, is what it writes to the lock
  // file - filter on it so a stale lock from a different process (e.g. a CLI
  // agent) can't be misread as this spawn succeeding.
  const port = await resolveElectronPort(child.pid);
  if (!port) {
    log.error('Server spawned but never wrote its port to the lock file within the timeout.');
    return null;
  }
  return port;
}

// Generation counter so a newer load request (renderer crash, failed load,
// watchdog reconnect) cancels any older polling loop still in flight.
let loadGeneration = 0;

// Polls the server until it responds, then loads the UI. Never gives up:
// after 10s the message switches to a troubleshooting hint but polling
// continues, so the window recovers by itself the moment the server is back.
async function loadWhenServerReady(win: BrowserWindow): Promise<void> {
  const generation = ++loadGeneration;

  if (serverMissing) {
    await win.loadURL(loadingHtml('No Reqly server found (bundled binary missing and no CLI installed). Reinstall the app, or run: npm install -g getreqly'));
    return;
  }

  win.loadURL(loadingHtml('Starting Reqly...')).catch(() => {});

  const started = Date.now();
  let slowMessageShown = false;
  while (!win.isDestroyed() && generation === loadGeneration) {
    // Re-read activePort each iteration, not just once at entry - the
    // watchdog can resolve a new port (server respawned on a new ephemeral
    // port) while this loop is still polling the old one.
    if (activePort !== null && await probeServer(activePort)) {
      try {
        await win.loadURL(serverUrl(activePort));
        log.info(`UI loaded on port ${activePort}.`);
      } catch (err) {
        // Server answered the probe but the page load failed (e.g. it died
        // mid-request). did-fail-load has already logged this; keep polling.
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      return;
    }
    if (!slowMessageShown && Date.now() - started > 10_000) {
      slowMessageShown = true;
      log.warn('Server still unreachable after 10s - continuing to poll.');
      const portHint = activePort !== null ? ` on :${activePort}` : '';
      win.loadURL(loadingHtml(`Still trying to reach the Reqly server${portHint}. It will load automatically once the server is up. Diagnostics: ${LOG_PATH}`)).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

// Renderer crash budget: reload on crash, but if the renderer dies more than
// 3 times in a minute something is systematically wrong - park on an error
// page instead of burning CPU in a crash loop.
let rendererCrashTimestamps: number[] = [];

function attachWindowDiagnostics(win: BrowserWindow): void {
  const wc = win.webContents;

  // A dead renderer is THE blank-black-window failure mode: the window keeps
  // its backgroundColor and nothing else. Log the reason and reload.
  wc.on('render-process-gone', (_event, details) => {
    log.error(`Renderer process gone: reason=${details.reason} exitCode=${details.exitCode}`);
    if (details.reason === 'clean-exit') return;
    const now = Date.now();
    rendererCrashTimestamps = rendererCrashTimestamps.filter(t => now - t < 60_000);
    rendererCrashTimestamps.push(now);
    if (rendererCrashTimestamps.length > 3) {
      log.error('Renderer crashed >3 times in 60s - stopping auto-reload.');
      win.loadURL(loadingHtml(`Reqly's UI crashed repeatedly (${details.reason}). Please restart the app. Diagnostics: ${LOG_PATH}`)).catch(() => {});
      return;
    }
    log.info('Reloading UI after renderer crash.');
    loadWhenServerReady(win);
  });

  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return; // -3 = load aborted by a newer navigation
    log.error(`Page load failed: code=${errorCode} (${errorDescription}) url=${validatedURL}`);
    loadWhenServerReady(win);
  });

  wc.on('unresponsive', () => log.warn('Window became unresponsive.'));
  wc.on('responsive', () => log.info('Window is responsive again.'));

  // Surface renderer-side JS errors (React crashes, unhandled rejections) in
  // the desktop log so blank-page reports come with a stack trace. Supports
  // both the legacy positional args and the newer event-object shape.
  wc.on('console-message', (event: any, ...legacy: any[]) => {
    const level = event?.level ?? legacy[0];
    const message = event?.message ?? legacy[1];
    const isErrorLevel = level === 'error' || level === 3;
    if (isErrorLevel) log.error(`[renderer] ${message}`);
  });
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

  attachWindowDiagnostics(mainWindow);

  // Close hides the window instead of destroying it - the server keeps running
  // and the window can be reopened from the tray (T-121). app.hide() hands
  // focus back to the previous app; without it Reqly (dock-less) stays the
  // frontmost app with no window, which reads as a frozen black screen.
  mainWindow.on('close', e => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow?.hide();
    if (process.platform === 'darwin') {
      app.hide();
      app.dock?.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  loadWhenServerReady(mainWindow);
}

// Health watchdog: probes the server every 5s. On sustained failure it
// respawns the server (within budget) and flips the window to the reconnect
// loop, which reloads the UI the moment the server answers again.
let consecutiveProbeFailures = 0;
let reconnectInFlight = false;

function startServerWatchdog(): void {
  setInterval(async () => {
    if (serverMissing || isQuitting) return;
    if (activePort !== null && await probeServer(activePort)) {
      consecutiveProbeFailures = 0;
      reconnectInFlight = false;
      return;
    }
    consecutiveProbeFailures++;
    if (consecutiveProbeFailures < 3 || reconnectInFlight) return;

    reconnectInFlight = true;
    log.error('Watchdog: server unreachable for 3 consecutive probes.');
    if (respawnBudgetExhausted()) {
      log.error(`Watchdog: respawn budget exhausted (${MAX_RESPAWNS_PER_WINDOW} in 10 min) - not respawning.`);
    } else {
      // A respawn lands on a NEW ephemeral port - activePort must be updated
      // before loadWhenServerReady polls again, or it keeps probing the dead
      // port forever.
      activePort = await spawnServerIfNeeded();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      loadWhenServerReady(mainWindow);
    }
  }, 5000);
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
  log.info(`Reqly Desktop starting (electron=${process.versions.electron} platform=${process.platform}).`);
  syncLoginItemFromConfig();
  activePort = await spawnServerIfNeeded();
  createWindow();
  createTray();
  startServerWatchdog();
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
    log.error(`Update check failed: ${err.message}`);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });

  // GPU process death also blanks the window; Chromium usually restarts it,
  // but the event must be on record when correlating blank-window reports.
  app.on('child-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    log.error(`Child process gone: type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`);
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
  log.info('Quitting Reqly Desktop.');

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
