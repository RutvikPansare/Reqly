import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface RunningLock {
  pid: number;
  projectDir: string;
  port: number;
  startedAt: string;
  type: 'electron' | 'agent';
}

export const LOCK_PATH = path.join(os.homedir(), '.reqly', 'running.json');

export async function writeLock(projectDir: string, port: number, type: 'electron' | 'agent' = 'agent'): Promise<void> {
  const lock: RunningLock = {
    pid: process.pid,
    projectDir,
    port,
    startedAt: new Date().toISOString(),
    type,
  };
  await fs.mkdir(path.dirname(LOCK_PATH), { recursive: true });
  await fs.writeFile(LOCK_PATH, JSON.stringify(lock, null, 2));
}

export async function readLock(): Promise<RunningLock | null> {
  try {
    const data = await fs.readFile(LOCK_PATH, 'utf-8');
    return JSON.parse(data) as RunningLock;
  } catch (e: any) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export async function clearLock(): Promise<void> {
  try {
    await fs.unlink(LOCK_PATH);
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Kills a stale server process without leaving an orphan: SIGTERM first, then
// polls until it's actually dead, escalating to SIGKILL if it ignores SIGTERM
// past the timeout. A blind fixed-delay wait (the old approach) lets slow- or
// non-exiting processes survive and accumulate across restarts (T-255).
export function killWithEscalation(
  pid: number,
  opts: { pollIntervalMs?: number; timeoutMs?: number } = {}
): Promise<void> {
  const pollIntervalMs = opts.pollIntervalMs ?? 100;
  const timeoutMs = opts.timeoutMs ?? 2000;

  return new Promise(resolve => {
    if (!isProcessAlive(pid)) { resolve(); return; }
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      resolve();
      return;
    }

    const start = Date.now();
    let killedHard = false;
    const poll = () => {
      if (!isProcessAlive(pid)) { resolve(); return; }
      if (!killedHard && Date.now() - start >= timeoutMs) {
        killedHard = true;
        try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
        // SIGKILL delivery isn't synchronous - keep polling briefly instead
        // of resolving before the OS has actually reaped the process.
      }
      setTimeout(poll, pollIntervalMs);
    };
    setTimeout(poll, pollIntervalMs);
  });
}

// Shared reap decision for both startup branches: only kill a stale lock
// left by the SAME process kind (electron reaps a dead-but-locked electron
// instance, agent reaps a dead-but-locked agent instance). A live lock of the
// OTHER kind is never killed here - the caller falls back to a different port
// instead. Keeping this as one pure function is what keeps the Electron-vs-
// agent distinction from drifting out of sync between the two call sites.
export function shouldReapStaleLock(
  existing: RunningLock | null,
  myLockType: 'electron' | 'agent'
): boolean {
  if (!existing) return false;
  if (!isProcessAlive(existing.pid)) return false;
  const existingType = existing.type ?? 'agent';
  return existingType === myLockType;
}

// Companion to shouldReapStaleLock: when a live lock of the OTHER kind
// already holds the port, don't fight it for 4242 - fall back to an
// OS-assigned ephemeral port instead of racing into EADDRINUSE (T-256).
export function shouldFallbackToEphemeralPort(
  existing: RunningLock | null,
  myLockType: 'electron' | 'agent'
): boolean {
  if (!existing) return false;
  if (!isProcessAlive(existing.pid)) return false;
  const existingType = existing.type ?? 'agent';
  return existingType !== myLockType;
}
