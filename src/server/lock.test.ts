import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { writeLock, readLock, clearLock, isProcessAlive, LOCK_PATH } from './lock.js';

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
});
