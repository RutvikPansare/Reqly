import { BrowserWindow, ipcMain, shell } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { listAgents, injectMcpConfig, markSetupComplete, AgentId } from './agent-config';
import { resolveReqly, bundledShimPath, ResolvedReqly } from './reqly-resolver';

/**
 * First-launch setup wizard (T-233): "Connect your AI Agent".
 *
 * Shown when ~/.reqly/config.json lacks `setupComplete: true`, and reachable
 * any time from the tray menu ("AI Agent Connections..."). Each agent button
 * injects the reqly MCP entry into that agent's config file using the
 * resolved server command (Homebrew CLI > npm CLI > bundled binary).
 */

let wizardWindow: BrowserWindow | null = null;
let handlersRegistered = false;

function symlinkTarget(): string {
  return '/usr/local/bin/reqly';
}

/**
 * Creates /usr/local/bin/reqly -> bundled shim. Tries a plain symlink first;
 * on permission failure escalates once via the native macOS admin prompt
 * (osascript). Only offered when no CLI is on PATH.
 */
function installShimInPath(): Promise<{ ok: boolean; message: string }> {
  return new Promise(resolve => {
    if (process.platform === 'win32') {
      resolve({ ok: false, message: 'On Windows, install the CLI with: npm install -g getreqly' });
      return;
    }
    const shim = bundledShimPath();
    if (!fs.existsSync(shim)) {
      resolve({ ok: false, message: 'Bundled binary not found (development build?).' });
      return;
    }
    const target = symlinkTarget();
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      try { fs.unlinkSync(target); } catch { /* not there - fine */ }
      fs.symlinkSync(shim, target);
      resolve({ ok: true, message: `Installed: ${target}` });
      return;
    } catch {
      // Fall through to the admin prompt.
    }
    if (process.platform !== 'darwin') {
      resolve({ ok: false, message: `No permission to write ${target}. Run: sudo ln -sf "${shim}" ${target}` });
      return;
    }
    const script = `do shell script "mkdir -p /usr/local/bin && ln -sf '${shim}' '${target}'" with administrator privileges`;
    execFile('osascript', ['-e', script], err => {
      if (err) resolve({ ok: false, message: 'Cancelled or failed. You can run it manually: sudo ln -sf "' + shim + '" ' + target });
      else resolve({ ok: true, message: `Installed: ${target}` });
    });
  });
}

function registerIpcHandlers(): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle('wizard:state', () => {
    const resolved: ResolvedReqly | null = resolveReqly();
    return {
      agents: listAgents().map(a => ({ id: a.id, name: a.name, detected: a.detected, configPath: a.configPath })),
      source: resolved ? { kind: resolved.kind, display: resolved.display } : null,
      // The "Install in PATH" button only makes sense when the bundled shim is
      // the active source (no CLI on PATH) and we're not on Windows.
      offerPathInstall: resolved?.kind === 'bundled' && process.platform !== 'win32',
    };
  });

  ipcMain.handle('wizard:connect', (_e, agentId: AgentId) => {
    const resolved = resolveReqly();
    if (!resolved) {
      return { ok: false, message: 'No Reqly server found: no CLI on PATH and no bundled binary. Install the CLI: npm install -g getreqly' };
    }
    return injectMcpConfig(agentId, resolved);
  });

  ipcMain.handle('wizard:install-path', () => installShimInPath());

  ipcMain.handle('wizard:done', () => {
    markSetupComplete();
    wizardWindow?.close();
    return { ok: true };
  });

  ipcMain.handle('wizard:open-external', (_e, url: string) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url);
  });
}

export function openSetupWizard(): BrowserWindow {
  registerIpcHandlers();

  if (wizardWindow && !wizardWindow.isDestroyed()) {
    wizardWindow.show();
    wizardWindow.focus();
    return wizardWindow;
  }

  wizardWindow = new BrowserWindow({
    width: 560,
    height: 640,
    resizable: false,
    backgroundColor: '#06090f',
    title: 'Reqly Setup',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'wizard-preload.js'),
    },
  });
  wizardWindow.setMenuBarVisibility(false);
  wizardWindow.loadFile(path.join(__dirname, '..', 'assets', 'wizard.html'));
  wizardWindow.on('closed', () => { wizardWindow = null; });
  return wizardWindow;
}
