import { describe, it, expect, vi, afterEach } from 'vitest';
import { definition, handler } from './stop-proxy.js';

describe('stop_proxy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct definition', () => {
    expect(definition.name).toBe('stop_proxy');
  });

  it('stops the proxy server', async () => {
    const stopSpy = vi.fn().mockResolvedValue(undefined);
    const mockContext: any = { proxyServer: { stop: stopSpy } };
    const res = await handler({}, mockContext);
    expect(stopSpy).toHaveBeenCalled();
    expect(res.isError).toBeUndefined();
  });

  it('kills the exec child process if one is tracked, and clears it', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any);
    const stopSpy = vi.fn().mockResolvedValue(undefined);
    const mockContext: any = { proxyServer: { stop: stopSpy }, execChildPid: 4242 };

    await handler({}, mockContext);

    expect(killSpy).toHaveBeenCalledWith(-4242);
    expect(mockContext.execChildPid).toBeUndefined();
  });

  it('falls back to killing the pid directly if killing the process group fails', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementation((pid: any) => {
      if (pid === -4242) throw new Error('ESRCH');
      return true as any;
    });
    const stopSpy = vi.fn().mockResolvedValue(undefined);
    const mockContext: any = { proxyServer: { stop: stopSpy }, execChildPid: 4242 };

    await handler({}, mockContext);

    expect(killSpy).toHaveBeenCalledWith(-4242);
    expect(killSpy).toHaveBeenCalledWith(4242);
  });

  it('returns an error if the proxy fails to stop', async () => {
    const mockContext: any = { proxyServer: { stop: vi.fn().mockRejectedValue(new Error('boom')) } };
    const res = await handler({}, mockContext);
    expect(res.isError).toBe(true);
  });
});
