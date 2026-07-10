import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { writeLock, readLock, clearLock, isProcessAlive, killWithEscalation, shouldReapStaleLock, shouldFallbackToEphemeralPort, LOCK_PATH } from './lock.js';

describe('lock', () => {
  beforeEach(() => {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
  });

  afterEach(() => {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
  });

  it('writes and reads back a lock file', async () => {
    await writeLock('/Users/test/project', 4242);
    const lock = await readLock();
    expect(lock).not.toBeNull();
    expect(lock!.projectDir).toBe('/Users/test/project');
    expect(lock!.port).toBe(4242);
    expect(lock!.pid).toBe(process.pid);
    expect(typeof lock!.startedAt).toBe('string');
  });

  it('returns null when no lock file exists', async () => {
    const lock = await readLock();
    expect(lock).toBeNull();
  });

  it('clears the lock file', async () => {
    await writeLock('/Users/test/project', 4242);
    await clearLock();
    const lock = await readLock();
    expect(lock).toBeNull();
  });

  it('clearLock is a no-op when no lock file exists', async () => {
    await expect(clearLock()).resolves.not.toThrow();
  });

  it('isProcessAlive returns true for the current process', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('isProcessAlive returns false for a pid that does not exist', () => {
    expect(isProcessAlive(999999)).toBe(false);
  });

  it('writeLock creates the .reqly directory if missing', async () => {
    const dir = path.dirname(LOCK_PATH);
    expect(fs.existsSync(dir)).toBe(true);
    await writeLock('/Users/test/project', 4242);
    expect(fs.existsSync(LOCK_PATH)).toBe(true);
  });

  it('writeLock defaults type to "agent"', async () => {
    await writeLock('/Users/test/project', 4242);
    const lock = await readLock();
    expect(lock!.type).toBe('agent');
  });

  it('writeLock stores type "electron" when specified', async () => {
    await writeLock('/Users/test/project', 51234, 'electron');
    const lock = await readLock();
    expect(lock!.type).toBe('electron');
    expect(lock!.port).toBe(51234);
  });

  it('writeLock stores type "agent" when explicitly specified', async () => {
    await writeLock('/Users/test/project', 4242, 'agent');
    const lock = await readLock();
    expect(lock!.type).toBe('agent');
  });

  describe('killWithEscalation', () => {
    const spawned: ChildProcess[] = [];

    afterEach(() => {
      for (const child of spawned) {
        if (child.pid && isProcessAlive(child.pid)) {
          try { process.kill(child.pid, 'SIGKILL'); } catch { /* already dead */ }
        }
      }
      spawned.length = 0;
    });

    function spawnChild(script: string): ChildProcess {
      const child = spawn(process.execPath, ['-e', script], { stdio: 'ignore' });
      spawned.push(child);
      return child;
    }

    it('resolves quickly when the process exits on SIGTERM alone', async () => {
      const child = spawnChild('setInterval(() => {}, 1000);');
      await new Promise(r => setTimeout(r, 100)); // let it actually start

      const start = Date.now();
      await killWithEscalation(child.pid!, { pollIntervalMs: 20, timeoutMs: 2000 });
      const elapsed = Date.now() - start;

      expect(isProcessAlive(child.pid!)).toBe(false);
      expect(elapsed).toBeLessThan(1000); // resolved via SIGTERM, not the 2s SIGKILL fallback
    });

    it('escalates to SIGKILL when the process ignores SIGTERM', async () => {
      const child = spawnChild("process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);");
      await new Promise(r => setTimeout(r, 100));

      const start = Date.now();
      await killWithEscalation(child.pid!, { pollIntervalMs: 20, timeoutMs: 300 });
      const elapsed = Date.now() - start;

      expect(isProcessAlive(child.pid!)).toBe(false);
      expect(elapsed).toBeGreaterThanOrEqual(300);
    });

    it('resolves cleanly for a pid that is already dead', async () => {
      await expect(killWithEscalation(999999)).resolves.not.toThrow();
    });
  });

  describe('shouldReapStaleLock', () => {
    it('returns false when there is no existing lock', () => {
      expect(shouldReapStaleLock(null, 'electron')).toBe(false);
    });

    it('returns false when the existing lock pid is dead', () => {
      expect(shouldReapStaleLock({ pid: 999999, projectDir: '/x', port: 4242, startedAt: '', type: 'electron' }, 'electron')).toBe(false);
    });

    it('returns true for a live stale electron lock when starting as electron', () => {
      expect(shouldReapStaleLock({ pid: process.pid, projectDir: '/x', port: 51234, startedAt: '', type: 'electron' }, 'electron')).toBe(true);
    });

    it('returns false for a live agent lock when starting as electron (different type, leave it alone)', () => {
      expect(shouldReapStaleLock({ pid: process.pid, projectDir: '/x', port: 4242, startedAt: '', type: 'agent' }, 'electron')).toBe(false);
    });

    it('returns true for a live stale agent lock when starting as agent', () => {
      expect(shouldReapStaleLock({ pid: process.pid, projectDir: '/x', port: 4242, startedAt: '', type: 'agent' }, 'agent')).toBe(true);
    });

    it('returns false for a live electron lock when starting as agent (fall back to port 0 instead)', () => {
      expect(shouldReapStaleLock({ pid: process.pid, projectDir: '/x', port: 51234, startedAt: '', type: 'electron' }, 'agent')).toBe(false);
    });
  });

  describe('shouldFallbackToEphemeralPort', () => {
    it('returns false when there is no existing lock', () => {
      expect(shouldFallbackToEphemeralPort(null, 'electron')).toBe(false);
    });

    it('returns false when the existing lock pid is dead (nothing to fall back from)', () => {
      expect(shouldFallbackToEphemeralPort({ pid: 999999, projectDir: '/x', port: 4242, startedAt: '', type: 'agent' }, 'electron')).toBe(false);
    });

    it('returns false when the existing live lock is the same type (that case reaps instead)', () => {
      expect(shouldFallbackToEphemeralPort({ pid: process.pid, projectDir: '/x', port: 4242, startedAt: '', type: 'agent' }, 'agent')).toBe(false);
    });

    it('returns true when a live agent owns 4242 and electron is starting', () => {
      expect(shouldFallbackToEphemeralPort({ pid: process.pid, projectDir: '/x', port: 4242, startedAt: '', type: 'agent' }, 'electron')).toBe(true);
    });

    it('returns true when a live electron owns 4242 and an agent is starting', () => {
      expect(shouldFallbackToEphemeralPort({ pid: process.pid, projectDir: '/x', port: 4242, startedAt: '', type: 'electron' }, 'agent')).toBe(true);
    });
  });
});
