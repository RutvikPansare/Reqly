import { describe, it, expect, beforeEach, vi } from 'vitest';
import { execute } from './http-executor.js';
import { ScriptVariableStore } from './script-variables.js';
import type { HttpMethod } from '../types/request.js';

vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

import { fetch } from 'undici';

describe('ScriptVariables', () => {
  let store: ScriptVariableStore;

  beforeEach(() => {
    store = new ScriptVariableStore();
    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      headers: new Headers(),
      arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('ok').buffer),
    } as any);
  });

  it('setVar persists across requests in the same collection', async () => {
    const config1 = {
      name: 'Req1',
      method: 'GET' as HttpMethod,
      url: 'http://localhost/test1',
      postScript: `reqly.setVar('token', 'abc-123');`,
    };

    const config2 = {
      name: 'Req2',
      method: 'GET' as HttpMethod,
      url: 'http://localhost/test2',
      postScript: `test('check var', () => { expect(reqly.getVar('token')).to.equal('abc-123'); });`,
    };

    const collectionName = 'test-collection';

    const onScriptVarSet = (key: string, value: string) => store.set(collectionName, key, value);
    
    // First request
    await execute(
      config1,
      undefined,
      undefined,
      true,
      50000,
      {},
      undefined,
      {},
      undefined,
      undefined,
      store.getAll(collectionName),
      onScriptVarSet
    );

    expect(store.get(collectionName, 'token')).toBe('abc-123');

    // Second request
    const res2 = await execute(
      config2,
      undefined,
      undefined,
      true,
      50000,
      {},
      undefined,
      {},
      undefined,
      undefined,
      store.getAll(collectionName),
      onScriptVarSet
    );

    console.log(res2.consoleLogs);
    expect(res2.testResults).toBeDefined();
    expect(res2.testResults![0].passed).toBe(true);
  });

  it('getVar returns undefined if not set', async () => {
    const config = {
      name: 'Req1',
      method: 'GET' as HttpMethod,
      url: 'http://localhost/test1',
      postScript: `test('check empty var', () => { expect(reqly.getVar('missing')).to.be.undefined; });`,
    };

    const collectionName = 'test-collection';
    const onScriptVarSet = (key: string, value: string) => store.set(collectionName, key, value);

    const res = await execute(
      config,
      undefined,
      undefined,
      true,
      50000,
      {},
      undefined,
      {},
      undefined,
      undefined,
      store.getAll(collectionName),
      onScriptVarSet
    );

    console.log(res.consoleLogs);
    expect(res.testResults![0].passed).toBe(true);
  });

  it('is isolated between collections', async () => {
    const config = {
      name: 'Req1',
      method: 'GET' as HttpMethod,
      url: 'http://localhost/test1',
      postScript: `reqly.setVar('token', 'abc-123');`,
    };

    const collectionName = 'test-col-1';
    const onScriptVarSet = (key: string, value: string) => store.set(collectionName, key, value);

    await execute(
      config,
      undefined,
      undefined,
      true,
      50000,
      {},
      undefined,
      {},
      undefined,
      undefined,
      store.getAll(collectionName),
      onScriptVarSet
    );

    expect(store.get('test-col-1', 'token')).toBe('abc-123');
    expect(store.get('test-col-2', 'token')).toBeUndefined();
  });
});
