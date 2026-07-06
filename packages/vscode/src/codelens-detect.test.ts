import { describe, it, expect } from 'vitest';
import { detectHttpCalls, matchSavedRequest } from './codelens-detect.js';
import { ReqlyCollection } from './api.js';

describe('detectHttpCalls', () => {
  it('detects a fetch call with a string literal URL', () => {
    const calls = detectHttpCalls(`const r = await fetch('https://api.example.com/users');`);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.example.com/users');
    expect(calls[0].method).toBe('GET');
    expect(calls[0].line).toBe(0);
  });

  it('detects fetch with a method option', () => {
    const src = `await fetch('https://api.example.com/users', { method: 'POST', body: '{}' });`;
    const calls = detectHttpCalls(src);
    expect(calls[0].method).toBe('POST');
  });

  it('detects axios.get / axios.post with the right methods', () => {
    const src = [
      `axios.get('https://api.example.com/a');`,
      `axios.post('https://api.example.com/b', data);`,
    ].join('\n');
    const calls = detectHttpCalls(src);
    expect(calls).toHaveLength(2);
    expect(calls[0].method).toBe('GET');
    expect(calls[1].method).toBe('POST');
    expect(calls[1].line).toBe(1);
  });

  it('detects bare axios(), got() and request() calls', () => {
    const src = [
      `axios('https://a.example.com');`,
      `got('https://b.example.com');`,
      `request('https://c.example.com');`,
    ].join('\n');
    const calls = detectHttpCalls(src);
    expect(calls.map(c => c.url)).toEqual([
      'https://a.example.com',
      'https://b.example.com',
      'https://c.example.com',
    ]);
  });

  it('keeps template-literal URLs with expressions, marking them dynamic', () => {
    const calls = detectHttpCalls('await fetch(`${base}/users/${id}`);');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('${base}/users/${id}');
    expect(calls[0].dynamic).toBe(true);
  });

  it('ignores calls without a URL argument and unrelated identifiers like prefetch', () => {
    const src = [
      `prefetch('https://nope.example.com');`,
      `myFetcher();`,
      `fetch(buildUrl());`,
    ].join('\n');
    expect(detectHttpCalls(src)).toHaveLength(0);
  });
});

describe('matchSavedRequest', () => {
  const collections: ReqlyCollection[] = [
    {
      name: 'users',
      projectDir: '/repo',
      requests: [
        { id: '1', name: 'list-users', method: 'GET', url: '{{baseUrl}}/users' },
        { id: '2', name: 'create-user', method: 'POST', url: '{{baseUrl}}/users' },
        { id: '3', name: 'get-user', method: 'GET', url: 'https://api.example.com/users/42' },
      ],
    },
  ];

  it('matches an exact URL', () => {
    const m = matchSavedRequest(collections, 'https://api.example.com/users/42', 'GET');
    expect(m?.request.name).toBe('get-user');
    expect(m?.collection.name).toBe('users');
  });

  it('matches a templated {{baseUrl}} request by path suffix and method', () => {
    const m = matchSavedRequest(collections, 'https://api.example.com/users', 'POST');
    expect(m?.request.name).toBe('create-user');
  });

  it('returns undefined when nothing matches', () => {
    expect(matchSavedRequest(collections, 'https://api.example.com/orders', 'GET')).toBeUndefined();
  });
});
