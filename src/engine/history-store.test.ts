import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HistoryStore } from './history-store.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

  it('stores the response body (serialized)', () => {
    const store = new HistoryStore();
    store.append(
      { name: 'GetUser', method: 'GET', url: 'http://x/u' } as any,
      { status: 200, latency: 10, body: '{"id":1}', headers: {} } as any
    );
    expect(store.list()[0].body).toBe('{"id":1}');
  });

  it('serializes object bodies to JSON strings', () => {
    const store = new HistoryStore();
    store.append(
      { name: 'R', method: 'GET', url: 'http://x' } as any,
      { status: 200, latency: 5, body: { count: 42 }, headers: {} } as any
    );
    expect(store.list()[0].body).toBe('{"count":42}');
  });

  it('truncates body to 10 KB', () => {
    const store = new HistoryStore();
    const huge = 'x'.repeat(20 * 1024);
    store.append(
      { name: 'Big', method: 'GET', url: 'http://x' } as any,
      { status: 200, latency: 5, body: huge, headers: {} } as any
    );
    expect(store.list()[0].body!.length).toBe(10 * 1024);
  });

  describe('getLastTwo', () => {
    it('returns an empty array when there are no entries for the request', () => {
      const store = new HistoryStore();
      expect(store.getLastTwo('Nope')).toHaveLength(0);
    });

    it('returns one entry when only one run exists', () => {
      const store = new HistoryStore();
      store.append(
        { name: 'GetUsers', method: 'GET', url: 'http://x/users' } as any,
        { status: 200, latency: 30, body: '[]', headers: {} } as any
      );
      expect(store.getLastTwo('GetUsers')).toHaveLength(1);
    });

    it('returns two entries newest-first when two runs exist', () => {
      const store = new HistoryStore();
      store.append(
        { name: 'GetUsers', method: 'GET', url: 'http://x/users' } as any,
        { status: 200, latency: 30, body: '[{"id":1}]', headers: {} } as any
      );
      store.append(
        { name: 'GetUsers', method: 'GET', url: 'http://x/users' } as any,
        { status: 200, latency: 45, body: '[{"id":1},{"id":2}]', headers: {} } as any
      );
      const two = store.getLastTwo('GetUsers');
      expect(two).toHaveLength(2);
      // newest is first
      expect(two[0].body).toBe('[{"id":1},{"id":2}]');
      expect(two[1].body).toBe('[{"id":1}]');
    });

    it('ignores entries from other requests', () => {
      const store = new HistoryStore();
      store.append(
        { name: 'GetUsers', method: 'GET', url: 'http://x/users' } as any,
        { status: 200, latency: 10, body: '[]', headers: {} } as any
      );
      store.append(
        { name: 'GetPosts', method: 'GET', url: 'http://x/posts' } as any,
        { status: 200, latency: 10, body: '[]', headers: {} } as any
      );
      const two = store.getLastTwo('GetUsers');
      expect(two).toHaveLength(1);
      expect(two[0].requestName).toBe('GetUsers');
    });
  });

  describe('Persistence', () => {
    let tempDir: string;
    let store: HistoryStore;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-test-'));
      store = new HistoryStore(tempDir);
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('writes to history.ndjson on append', () => {
      store.append(
        { name: 'P1', method: 'GET', url: 'http://x' } as any,
        { status: 200, latency: 5, body: '', headers: {} } as any
      );
      const ndjson = path.join(tempDir, '.reqly', 'history.ndjson');
      expect(fs.existsSync(ndjson)).toBe(true);
      const content = fs.readFileSync(ndjson, 'utf8');
      expect(content).toContain('"requestName":"P1"');
    });

    it('loads existing history from disk on init', () => {
      store.append(
        { name: 'P1', method: 'GET', url: 'http://x' } as any,
        { status: 200, latency: 5, body: '', headers: {} } as any
      );
      
      const store2 = new HistoryStore(tempDir);
      const list = store2.list();
      expect(list).toHaveLength(1);
      expect(list[0].requestName).toBe('P1');
    });

    it('reloads history from disk when reloadFromDisk is called', () => {
      store.append(
        { name: 'P1', method: 'GET', url: 'http://x' } as any,
        { status: 200, latency: 5, body: '', headers: {} } as any
      );
      
      const store2 = new HistoryStore(tempDir);
      expect(store2.list()).toHaveLength(1);
      
      // another process writes to the file
      store.append(
        { name: 'P2', method: 'GET', url: 'http://x' } as any,
        { status: 200, latency: 5, body: '', headers: {} } as any
      );
      
      // store2 doesn't know yet
      expect(store2.list()).toHaveLength(1);
      
      store2.reloadFromDisk();
      expect(store2.list()).toHaveLength(2);
      expect(store2.list()[0].requestName).toBe('P2'); // newest first
    });
  });
});

