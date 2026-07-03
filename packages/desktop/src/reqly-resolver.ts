import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Where the `reqly` server command comes from, in priority order (T-233):
 *
 *   1. Homebrew CLI  - /opt/homebrew/bin/reqly or /usr/local/bin/reqly
 *   2. npm global CLI - `which reqly` / `where reqly`
 *   3. Bundled shim   - <resources>/bin/reqly(.cmd) inside the packaged app
 *
 * Developers who installed the CLI keep using it (so `brew upgrade` /
 * `npm update -g` keeps agents current). Non-technical users who only have
 * the DMG transparently fall back to the bundled binary.
 */
export type ReqlySourceKind = 'brew' | 'npm' | 'bundled';

export interface ResolvedReqly {
  kind: ReqlySourceKind;
  /** Absolute path (brew/bundled) or bare command name resolved from PATH (npm). */
  command: string;
  /** Human-readable origin for the wizard UI. */
  display: string;
}

const BREW_PATHS = ['/opt/homebrew/bin/reqly', '/usr/local/bin/reqly'];

export function bundledShimPath(resourcesPath: string = process.resourcesPath): string {
  const shim = process.platform === 'win32' ? 'reqly.cmd' : 'reqly';
  return path.join(resourcesPath, 'bin', shim);
}

/** Entry point of the bundled server, for spawning via ELECTRON_RUN_AS_NODE. */
export function bundledServerEntry(resourcesPath: string = process.resourcesPath): string {
  return path.join(resourcesPath, 'server', 'dist', 'server', 'index.js');
}

export function resolveReqly(resourcesPath: string = process.resourcesPath): ResolvedReqly | null {
  // 1. Homebrew
  if (process.platform !== 'win32') {
    for (const p of BREW_PATHS) {
      if (fs.existsSync(p)) {
        return { kind: 'brew', command: p, display: `Homebrew CLI (${p})` };
      }
    }
  }

  // 2. npm global (or any PATH install)
  const probe = process.platform === 'win32'
    ? spawnSync('where', ['reqly'], { encoding: 'utf8' })
    : spawnSync('which', ['reqly'], { encoding: 'utf8' });
  if (probe.status === 0 && probe.stdout) {
    const first = probe.stdout.split(/\r?\n/).find(l => l.trim().length > 0);
    if (first) {
      return { kind: 'npm', command: first.trim(), display: `CLI on PATH (${first.trim()})` };
    }
  }

  // 3. Bundled shim (packaged app only - absent in dev where resourcesPath
  //    points at node_modules/electron/dist/...).
  const shim = bundledShimPath(resourcesPath);
  if (fs.existsSync(shim) && fs.existsSync(bundledServerEntry(resourcesPath))) {
    return { kind: 'bundled', command: shim, display: 'Bundled with the desktop app' };
  }

  return null;
}
