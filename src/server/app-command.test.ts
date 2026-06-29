import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { LOCK_PATH, writeLock, clearLock } from './lock.js';
import { handleAppCommand } from './app-command.js';

describe('handleAppCommand', () => {
  beforeEach(() => {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
  });

  afterEach(() => {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
    vi.restoreAllMocks();
  });

  it('prints a hint and exits 1 when no Reqly instance is running', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const openUrl = vi.fn();

    const exitCode = await handleAppCommand({ openUrl });

    expect(exitCode).toBe(1);
    expect(logSpy).toHaveBeenCalledWith('Reqly is not running. Start it with: reqly start');
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('prints a hint and exits 1 when the lock file points at a dead pid', async () => {
    await writeLock('/tmp/whatever', 4242);
    const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf-8'));
    lock.pid = 999999;
    fs.writeFileSync(LOCK_PATH, JSON.stringify(lock));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const openUrl = vi.fn();

    const exitCode = await handleAppCommand({ openUrl });

    expect(exitCode).toBe(1);
    expect(logSpy).toHaveBeenCalledWith('Reqly is not running. Start it with: reqly start');
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('opens the running server URL in the default browser and exits 0', async () => {
    await writeLock('/tmp/whatever', 4999);
    const openUrl = vi.fn();

    const exitCode = await handleAppCommand({ openUrl });

    expect(exitCode).toBe(0);
    expect(openUrl).toHaveBeenCalledWith('http://localhost:4999');
  });

  it('defaults to port 4242 when the lock file has no port', async () => {
    await writeLock('/tmp/whatever', 4242);
    const openUrl = vi.fn();

    const exitCode = await handleAppCommand({ openUrl });

    expect(exitCode).toBe(0);
    expect(openUrl).toHaveBeenCalledWith('http://localhost:4242');
  });
});
