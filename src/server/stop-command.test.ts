import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { LOCK_PATH, writeLock, clearLock } from './lock.js';
import { handleStopCommand } from './stop-command.js';

describe('handleStopCommand', () => {
  beforeEach(() => {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
  });

  afterEach(() => {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
    vi.restoreAllMocks();
  });

  it('prints message and exits 0 when no lock file exists', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitCode = await handleStopCommand();
    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith('No Reqly instance running.');
  });

  it('prints message and exits 0 when lock file pid is dead', async () => {
    await writeLock('/tmp/whatever', 4242);
    const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf-8'));
    lock.pid = 999999;
    fs.writeFileSync(LOCK_PATH, JSON.stringify(lock));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitCode = await handleStopCommand();
    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith('No Reqly instance running.');
  });

  it('posts to /api/shutdown and clears the lock on success', async () => {
    await writeLock('/tmp/whatever', 4999);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const exitCode = await handleStopCommand();

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4999/api/shutdown', expect.objectContaining({ method: 'POST' }));
    expect(exitCode).toBe(0);
    expect(fs.existsSync(LOCK_PATH)).toBe(false);
  });
});
