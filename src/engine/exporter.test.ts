import { describe, it, expect } from 'vitest';
import { exportToPostman, exportToOpenApi } from './exporter.js';
import type { Collection } from '../types/index.js';

const sampleCollection: Collection = {
  name: 'My API',
  requests: [
    {
      id: '1',
      name: 'Get Users',
      method: 'GET',
      url: 'https://api.example.com/users',
      headers: { Authorization: 'Bearer token' },
    },
    {
      id: '2',
      name: 'Create User',
      method: 'POST',
      url: 'https://api.example.com/users',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":"John","email":"john@example.com"}',
    },
    {
      id: '3',
      name: 'Delete User',
      method: 'DELETE',
      url: 'https://api.example.com/users/1',
    },
  ],
};

describe('exportToPostman', () => {
  it('exports valid Postman v2.1 JSON', () => {
    const json = exportToPostman(sampleCollection);
    const parsed = JSON.parse(json);
    expect(parsed.info.name).toBe('My API');
    expect(parsed.info.schema).toContain('v2.1');
  });

  it('exports all requests', () => {
    const parsed = JSON.parse(exportToPostman(sampleCollection));
    expect(parsed.item).toHaveLength(3);
  });

  it('sets correct method and URL on each request', () => {
    const parsed = JSON.parse(exportToPostman(sampleCollection));
    const post = parsed.item.find((i: any) => i.name === 'Create User');
    expect(post.request.method).toBe('POST');
    expect(post.request.url.raw).toBe('https://api.example.com/users');
  });

  it('includes headers in Postman format', () => {
    const parsed = JSON.parse(exportToPostman(sampleCollection));
    const get = parsed.item.find((i: any) => i.name === 'Get Users');
    expect(get.request.header).toEqual(
      expect.arrayContaining([{ key: 'Authorization', value: 'Bearer token' }])
    );
  });

  it('includes raw body for POST', () => {
    const parsed = JSON.parse(exportToPostman(sampleCollection));
    const post = parsed.item.find((i: any) => i.name === 'Create User');
    expect(post.request.body.mode).toBe('raw');
    expect(post.request.body.raw).toContain('"name":"John"');
  });

  it('handles requests with no headers or body', () => {
    const parsed = JSON.parse(exportToPostman(sampleCollection));
    const del = parsed.item.find((i: any) => i.name === 'Delete User');
    expect(del.request.method).toBe('DELETE');
    expect(del.request.header).toEqual([]);
  });

  // Regression: query params live in req.params (agents are told to use it over
  // inline URLs), but export dropped them entirely - the exported request would
  // hit the endpoint with no query string.
  it('exports req.params as Postman url.query and in the raw url', () => {
    const col: Collection = {
      name: 'Q', requests: [
        { id: '1', name: 'Search', method: 'GET', url: 'https://api.example.com/search', params: { q: 'term', page: '2' } },
      ],
    };
    const item = JSON.parse(exportToPostman(col)).item[0];
    expect(item.request.url.query).toEqual(
      expect.arrayContaining([{ key: 'q', value: 'term' }, { key: 'page', value: '2' }]),
    );
    expect(item.request.url.raw).toContain('q=term');
    expect(item.request.url.raw).toContain('page=2');
  });
});

describe('exportToOpenApi', () => {
  it('exports valid OpenAPI 3.0 JSON', () => {
    const json = exportToOpenApi(sampleCollection);
    const parsed = JSON.parse(json);
    expect(parsed.openapi).toBe('3.0.0');
    expect(parsed.info.title).toBe('My API');
  });

  it('creates paths for each request', () => {
    const parsed = JSON.parse(exportToOpenApi(sampleCollection));
    expect(parsed.paths['/users']).toBeDefined();
    expect(parsed.paths['/users/1']).toBeDefined();
  });

  it('uses lowercase method keys', () => {
    const parsed = JSON.parse(exportToOpenApi(sampleCollection));
    expect(parsed.paths['/users']['get']).toBeDefined();
    expect(parsed.paths['/users']['post']).toBeDefined();
    expect(parsed.paths['/users/1']['delete']).toBeDefined();
  });

  it('includes operationId derived from request name', () => {
    const parsed = JSON.parse(exportToOpenApi(sampleCollection));
    const getOp = parsed.paths['/users']['get'];
    expect(getOp.operationId).toBeTruthy();
  });

  it('includes requestBody for POST with body', () => {
    const parsed = JSON.parse(exportToOpenApi(sampleCollection));
    const postOp = parsed.paths['/users']['post'];
    expect(postOp.requestBody).toBeDefined();
  });

  it('exports req.params as OpenAPI query parameters', () => {
    const col: Collection = {
      name: 'Q', requests: [
        { id: '1', name: 'Search', method: 'GET', url: 'https://api.example.com/search', params: { q: 'term' } },
      ],
    };
    const op = JSON.parse(exportToOpenApi(col)).paths['/search']['get'];
    expect(op.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'q', in: 'query' }),
      ]),
    );
  });
});
