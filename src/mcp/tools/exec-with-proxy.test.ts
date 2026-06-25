import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const spawnMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: any[]) => spawnMock(...args)
}));

import { definition, handler } from './exec-with-proxy.js';

function fakeChild(pid: number) {
  const child: any = new EventEmitter();
  child.pid = pid;
  child.stdout = Object.assign(new EventEmitter(), { pipe: vi.fn() });
  child.stderr = Object.assign(new EventEmitter(), { pipe: vi.fn() });
  child.unref = vi.fn();
  return child;
}

describe('exec_with_proxy', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('should have correct definition', () => {
    expect(definition.name).toBe('exec_with_proxy');
  });

  it('starts the proxy and spawns the command with proxy env vars injected', async () => {
    spawnMock.mockReturnValue(fakeChild(4242));
    const startSpy = vi.fn().mockResolvedValue(undefined);
    const mockContext: any = {
      proxyServer: { start: startSpy }
    };

    const res = await handler({ command: 'npm run dev', collection: 'Dabbr API', port: 8888 }, mockContext);

    expect(startSpy).toHaveBeenCalledWith({ port: 8888, collectionName: 'Dabbr API' });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [, , spawnOpts] = spawnMock.mock.calls[0];
    expect(spawnOpts.env.HTTP_PROXY).toBe('http://localhost:8888');
    expect(spawnOpts.env.HTTPS_PROXY).toBe('http://localhost:8888');
    expect(spawnOpts.detached).toBe(true);

    const body = JSON.parse(res.content[0].text);
    expect(body.ok).toBe(true);
    expect(body.spawned).toBe(true);
    expect(body.pid).toBe(4242);
    expect(mockContext.execChildPid).toBe(4242);
  });

  it('defaults port to 8080 and collection to Captured', async () => {
    spawnMock.mockReturnValue(fakeChild(1));
    const startSpy = vi.fn().mockResolvedValue(undefined);
    const mockContext: any = { proxyServer: { start: startSpy } };

    await handler({ command: 'npm run dev' }, mockContext);

    expect(startSpy).toHaveBeenCalledWith({ port: 8080, collectionName: 'Captured' });
  });

  it('falls back with a runnable command string when spawn throws', async () => {
    spawnMock.mockImplementation(() => {
      throw new Error('ENOENT: command not found');
    });
    const startSpy = vi.fn().mockResolvedValue(undefined);
    const mockContext: any = { proxyServer: { start: startSpy } };

    const res = await handler({ command: 'doesnotexist', port: 9000, collection: 'X' }, mockContext);

    const body = JSON.parse(res.content[0].text);
    expect(body.ok).toBe(true);
    expect(body.spawned).toBe(false);
    expect(body.fallbackCommand).toContain('reqly exec');
    expect(body.fallbackCommand).toContain('doesnotexist');
  });

  it('returns an error when the proxy itself fails to start', async () => {
    const startSpy = vi.fn().mockRejectedValue(new Error('port in use'));
    const mockContext: any = { proxyServer: { start: startSpy } };

    const res = await handler({ command: 'npm run dev' }, mockContext);

    expect(res.isError).toBe(true);
  });
});
