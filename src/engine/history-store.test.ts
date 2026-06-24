import { describe, it, expect } from 'vitest';
import { HistoryStore } from './history-store.js';

describe('HistoryStore', () => {
  it('appends an entry and lists newest first', () => {
    const store = new HistoryStore();
    store.append(
      { name: 'A', method: 'GET', url: 'http://x/a' } as any,
      { status: 200, latency: 12, body: '', headers: {} } as any
    );
    store.append(
      { name: 'B', method: 'POST', url: 'http://x/b' } as any,
      { status: 201, latency: 30, body: '', headers: {} } as any
    );

    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list[0].method).toBe('POST');
    expect(list[1].method).toBe('GET');
    expect(list[0].requestName).toBe('B');
  });

  it('records method, url, status, latency and request name', () => {
    const store = new HistoryStore();
    store.append(
      { name: 'GetUser', method: 'GET', url: 'http://x/u' } as any,
      { status: 200, latency: 45, body: '', headers: {} } as any,
      { collectionName: 'Users' }
    );

    const entry = store.list()[0];
    expect(entry).toMatchObject({
      method: 'GET',
      url: 'http://x/u',
      status: 200,
      latency: 45,
      requestName: 'GetUser',
      collectionName: 'Users'
    });
    expect(entry.id).toBeTruthy();
  });

  it('caps stored entries at 200', () => {
    const store = new HistoryStore();
    for (let i = 0; i < 250; i++) {
      store.append(
        { name: `R${i}`, method: 'GET', url: `http://x/${i}` } as any,
        { status: 200, latency: 1, body: '', headers: {} } as any
      );
    }
    expect(store.list()).toHaveLength(200);
    // newest retained is the last appended
    expect(store.list()[0].requestName).toBe('R249');
  });

  it('clears all entries', () => {
    const store = new HistoryStore();
    store.append(
      { name: 'A', method: 'GET', url: 'http://x' } as any,
      { status: 200, latency: 1, body: '', headers: {} } as any
    );
    store.clear();
    expect(store.list()).toHaveLength(0);
  });

  it('finds an entry by id', () => {
    const store = new HistoryStore();
    store.append(
      { name: 'A', method: 'GET', url: 'http://x' } as any,
      { status: 200, latency: 1, body: '', headers: {} } as any
    );
    const id = store.list()[0].id;
    expect(store.get(id)?.requestName).toBe('A');
    expect(store.get('nope')).toBeUndefined();
  });
});
