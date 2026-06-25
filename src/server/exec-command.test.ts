import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const spawnMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: any[]) => spawnMock(...args)
}));

import { handleExecCommand } from './exec-command.js';
import { ParsedArgs } from './cli-parser.js';

function fakeChild() {
  const child: any = new EventEmitter();
  child.pid = 555;
  return child;
}

describe('handleExecCommand', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  function buildParsed(args: string[], flags: Partial<ParsedArgs['flags']> = {}): ParsedArgs {
    return { command: 'exec', args, flags };
  }

  it('returns exit code 1 and an error when no command is given', async () => {
    const proxyServer: any = { start: vi.fn(), stop: vi.fn() };
    const exitCode = await handleExecCommand(buildParsed([]), proxyServer);
    expect(exitCode).toBe(1);
    expect(proxyServer.start).not.toHaveBeenCalled();
  });

  it('starts the proxy, spawns the command with proxy env vars, and stops the proxy on exit', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const proxyServer: any = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined), capturedRequests: [{}, {}] };

    const promise = handleExecCommand(buildParsed(['npm', 'run', 'dev'], { port: '8888', collection: 'Dabbr API' }), proxyServer);
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());

    expect(proxyServer.start).toHaveBeenCalledWith({ port: 8888, collectionName: 'Dabbr API' });
    const [cmd, cmdArgs, opts] = spawnMock.mock.calls[0];
    expect(cmd).toBe('npm');
    expect(cmdArgs).toEqual(['run', 'dev']);
    expect(opts.stdio).toBe('inherit');
    expect(opts.env.HTTP_PROXY).toBe('http://localhost:8888');
    expect(opts.env.HTTPS_PROXY).toBe('http://localhost:8888');

    child.emit('exit', 0);
    const exitCode = await promise;

    expect(proxyServer.stop).toHaveBeenCalled();
    expect(exitCode).toBe(0);
  });

  it('defaults port to 8080 and collection to Captured', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const proxyServer: any = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined), capturedRequests: [] };

    const promise = handleExecCommand(buildParsed(['npm', 'run', 'dev']), proxyServer);
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
    expect(proxyServer.start).toHaveBeenCalledWith({ port: 8080, collectionName: 'Captured' });
    child.emit('exit', 0);
    await promise;
  });

  it('propagates the child process exit code', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const proxyServer: any = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined), capturedRequests: [] };

    const promise = handleExecCommand(buildParsed(['npm', 'run', 'dev']), proxyServer);
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalled());
    child.emit('exit', 7);
    const exitCode = await promise;
    expect(exitCode).toBe(7);
  });
});
