import { describe, it, expect } from 'vitest';
import { definition, handler } from './get-proxy-status.js';

describe('get-proxy-status', () => {
  it('should have correct definition', () => {
    expect(definition.name).toBe('get_proxy_status');
    expect(definition.inputSchema.required).toEqual([]);
  });

  it('returns the proxy status from the engine', async () => {
    const mockContext: any = {
      proxyServer: {
        getStatus: () => ({ running: true, port: 7474, collectionName: 'captured' }),
      },
    };
    const res = await handler({}, mockContext);
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text as string);
    expect(parsed).toEqual({ running: true, port: 7474, collectionName: 'captured' });
  });

  it('returns running: false when the proxy is stopped', async () => {
    const mockContext: any = {
      proxyServer: { getStatus: () => ({ running: false }) },
    };
    const res = await handler({}, mockContext);
    const parsed = JSON.parse(res.content[0].text as string);
    expect(parsed).toEqual({ running: false });
  });
});
