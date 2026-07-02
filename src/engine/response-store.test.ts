import { describe, it, expect, beforeEach } from 'vitest';
import { ResponseStore } from './response-store.js';
import { HttpResponse } from '../types/index.js';

describe('ResponseStore', () => {
  let store: ResponseStore;

  beforeEach(() => {
    store = new ResponseStore();
  });

  it('should store and retrieve responses', () => {
    const res: HttpResponse = { status: 200, latency: 10, headers: { 'x-test': '1' }, body: { id: 123 }, timestamp: new Date().toISOString() };
    store.set('req1', res);
    
    expect(store.get('req1')).toBe(res);
    expect(store.get('req2')).toBeUndefined();
  });

  it('should resolve body paths', () => {
    const res: HttpResponse = { status: 200, latency: 10, headers: {}, body: { user: { token: 'abc' } }, timestamp: new Date().toISOString() };
    store.set('login', res);

    expect(store.getValue('login.response.status')).toBe(200);
    expect(store.getValue('login.response.body.user.token')).toBe('abc');
    expect(store.getValue('login.response.headers')).toBeUndefined(); // Only body and status exposed via paths for now, or maybe headers too?
    expect(store.getValue('missing.response.status')).toBeUndefined();
  });

  describe('Persistence', () => {
    let tempDir: string;

    beforeEach(async () => {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-res-test-'));
    });

    it('should save and load responses across instances', async () => {
      const store1 = new ResponseStore(tempDir);
      const res: HttpResponse = { status: 201, latency: 5, headers: {}, body: { ok: true }, timestamp: new Date().toISOString() };
      store1.set('req1', res);

      // wait for debounce
      await new Promise(resolve => setTimeout(resolve, 150));

      const store2 = new ResponseStore(tempDir);
      const loadedRes = store2.get('req1');
      expect(loadedRes).toBeDefined();
      expect(loadedRes?.status).toBe(201);
      expect(loadedRes?.body).toEqual({ ok: true });
    });
  });
});
