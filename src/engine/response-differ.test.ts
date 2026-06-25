import { describe, it, expect } from 'vitest';
import { diffResponses } from './response-differ.js';
import type { HistoryEntry } from './history-store.js';

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'h-1',
    timestamp: Date.now(),
    method: 'GET',
    url: 'https://api.example.com/users',
    status: 200,
    latency: 50,
    requestName: 'GetUsers',
    ...overrides
  };
}

describe('diffResponses', () => {
  it('reports no changes when status and body are identical', () => {
    const body = '{"id":1}';
    const prev = entry({ status: 200, latency: 50, body });
    const curr = entry({ status: 200, latency: 55, body });
    const diff = diffResponses(prev, curr);
    expect(diff.statusChanged).toBe(false);
    expect(diff.bodyChanges).toHaveLength(0);
  });

  it('reports statusChanged when the status code differs', () => {
    const prev = entry({ status: 200, latency: 40 });
    const curr = entry({ status: 404, latency: 20 });
    const diff = diffResponses(prev, curr);
    expect(diff.statusChanged).toBe(true);
    expect(diff.prevStatus).toBe(200);
    expect(diff.currStatus).toBe(404);
  });

  it('computes latencyDelta as curr minus prev', () => {
    const prev = entry({ latency: 40 });
    const curr = entry({ latency: 90 });
    expect(diffResponses(prev, curr).latencyDelta).toBe(50);
  });

  it('latencyDelta is negative when the request got faster', () => {
    const prev = entry({ latency: 200 });
    const curr = entry({ latency: 80 });
    expect(diffResponses(prev, curr).latencyDelta).toBe(-120);
  });

  // ── JSON object diffs ──────────────────────────────────────────────────

  it('detects an added top-level JSON key', () => {
    const prev = entry({ body: '{"name":"Alice"}' });
    const curr = entry({ body: '{"name":"Alice","email":"a@b.com"}' });
    const { bodyChanges } = diffResponses(prev, curr);
    expect(bodyChanges.some(c => c.startsWith('+') && c.includes('email'))).toBe(true);
  });

  it('detects a removed top-level JSON key', () => {
    const prev = entry({ body: '{"name":"Alice","role":"admin"}' });
    const curr = entry({ body: '{"name":"Alice"}' });
    const { bodyChanges } = diffResponses(prev, curr);
    expect(bodyChanges.some(c => c.startsWith('-') && c.includes('role'))).toBe(true);
  });

  it('detects a changed top-level JSON value', () => {
    const prev = entry({ body: '{"count":5}' });
    const curr = entry({ body: '{"count":9}' });
    const { bodyChanges } = diffResponses(prev, curr);
    expect(bodyChanges.some(c => c.startsWith('~') && c.includes('count'))).toBe(true);
  });

  it('reports no body changes for identical JSON', () => {
    const body = '{"a":1,"b":2}';
    const prev = entry({ body });
    const curr = entry({ body });
    expect(diffResponses(prev, curr).bodyChanges).toHaveLength(0);
  });

  // ── Non-JSON / plain text line diff ───────────────────────────────────

  it('falls back to line diff for non-JSON bodies', () => {
    const prev = entry({ body: 'line one\nline two\nline three' });
    const curr = entry({ body: 'line one\nline three\nline four' });
    const { bodyChanges } = diffResponses(prev, curr);
    expect(bodyChanges.some(c => c.startsWith('-') && c.includes('line two'))).toBe(true);
    expect(bodyChanges.some(c => c.startsWith('+') && c.includes('line four'))).toBe(true);
  });

  it('returns empty bodyChanges when both bodies are undefined', () => {
    const prev = entry({ body: undefined });
    const curr = entry({ body: undefined });
    expect(diffResponses(prev, curr).bodyChanges).toHaveLength(0);
  });

  it('reports body appeared when only curr has a body', () => {
    const prev = entry({ body: undefined });
    const curr = entry({ body: '{"id":1}' });
    const { bodyChanges } = diffResponses(prev, curr);
    expect(bodyChanges.length).toBeGreaterThan(0);
  });

  it('handles JSON arrays without throwing', () => {
    const prev = entry({ body: '[1,2,3]' });
    const curr = entry({ body: '[1,2,3,4]' });
    // Arrays fall through to line diff - should not throw
    expect(() => diffResponses(prev, curr)).not.toThrow();
  });
});
