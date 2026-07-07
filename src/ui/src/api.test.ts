import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deleteRequest, deleteExample } from './api.js';

// api.ts functions are thin fetch wrappers; stub global fetch and assert the
// request URL. Node env - no DOM needed.
describe('api URL encoding', () => {
  let calls: string[];
  const okJson = { ok: true, json: async () => ({ success: true }) } as any;

  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn((url: string) => { calls.push(url); return Promise.resolve(okJson); }));
  });
  afterEach(() => vi.unstubAllGlobals());

  // Regression: deleteRequest was the only call not encoding its path segments,
  // so a name with a space/#/?// broke the URL (truncated or mis-routed).
  it('encodes collection and request names in deleteRequest', async () => {
    await deleteRequest('My Col', 'Get Users #2');
    expect(calls[0]).toBe('/api/collections/My%20Col/requests/Get%20Users%20%232');
    expect(calls[0]).not.toContain(' ');
    expect(calls[0]).not.toContain('#');
  });

  it('still encodes names in deleteExample (guard)', async () => {
    await deleteExample('My Col', 'Get Users', 'ex 1');
    expect(calls[0]).toBe('/api/collections/My%20Col/requests/Get%20Users/examples/ex%201');
  });
});
