import { describe, it, expect } from 'vitest';
import { findOperation, validate, listOperations } from './contract-validator.js';
import { HttpResponse } from '../types/index.js';

const spec: any = {
  openapi: '3.0.0',
  paths: {
    '/users/{id}': {
      get: {
        operationId: 'getUser',
        summary: 'Get a user',
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id', 'name'],
                  properties: { id: { type: 'string' }, name: { type: 'string' }, age: { type: 'integer' } },
                },
              },
            },
          },
          '404': { description: 'Not found' },
        },
      },
    },
    '/users': {
      post: {
        operationId: 'createUser',
        responses: { '201': { description: 'Created' } },
      },
    },
  },
};

function resp(over: Partial<HttpResponse> = {}): HttpResponse {
  return {
    status: 200,
    body: { id: 'u1', name: 'alice' },
    headers: { 'content-type': 'application/json' },
    latency: 5,
    timestamp: new Date().toISOString(),
    ...over,
  };
}

describe('findOperation', () => {
  it('matches by explicit specOperationId', () => {
    const m = findOperation(spec, 'GET', 'https://api.x.com/anything', 'https://api.x.com', 'getUser');
    expect(m?.path).toBe('/users/{id}');
    expect(m?.method).toBe('get');
    expect(m?.operationId).toBe('getUser');
  });

  it('matches an exact path with no parameters', () => {
    const m = findOperation(spec, 'POST', 'https://api.x.com/users', 'https://api.x.com');
    expect(m?.path).toBe('/users');
    expect(m?.operationId).toBe('createUser');
  });

  it('matches a parameterised path, stripping the base URL', () => {
    const m = findOperation(spec, 'GET', 'https://api.x.com/users/42', 'https://api.x.com');
    expect(m?.path).toBe('/users/{id}');
    expect(m?.operationId).toBe('getUser');
  });

  it('returns null when no path matches', () => {
    const m = findOperation(spec, 'GET', 'https://api.x.com/orders/9', 'https://api.x.com');
    expect(m).toBeNull();
  });

  it('returns null when the path matches but the method does not', () => {
    const m = findOperation(spec, 'DELETE', 'https://api.x.com/users/42', 'https://api.x.com');
    expect(m).toBeNull();
  });
});

describe('validate', () => {
  const op = (spec.paths['/users/{id}'].get) as any;

  it('returns no violations for a clean response', () => {
    expect(validate(op, resp())).toEqual([]);
  });

  it('flags a status code not defined in the spec', () => {
    const violations = validate(op, resp({ status: 500, body: null }));
    expect(violations.some(v => v.severity === 'error' && /status/i.test(v.message))).toBe(true);
  });

  it('flags a missing required field', () => {
    const violations = validate(op, resp({ body: { id: 'u1' } }));
    expect(violations.some(v => /name/.test(v.message))).toBe(true);
  });

  it('flags a wrong type', () => {
    const violations = validate(op, resp({ body: { id: 'u1', name: 'alice', age: 'not-a-number' } }));
    expect(violations.some(v => /age/.test(v.field) || /age/.test(v.message))).toBe(true);
  });

  it('flags a Content-Type mismatch as a warning', () => {
    const violations = validate(op, resp({ headers: { 'content-type': 'text/plain' } }));
    expect(violations.some(v => v.severity === 'warning' && /content-type/i.test(v.message))).toBe(true);
  });

  it('does not flag a status with no schema (e.g. 404)', () => {
    expect(validate(op, resp({ status: 404, body: null, headers: {} }))).toEqual([]);
  });
});

describe('listOperations', () => {
  it('lists every operation with id, method, path, and summary', () => {
    const ops = listOperations(spec);
    expect(ops).toContainEqual({ operationId: 'getUser', method: 'GET', path: '/users/{id}', summary: 'Get a user' });
    expect(ops).toContainEqual({ operationId: 'createUser', method: 'POST', path: '/users', summary: undefined });
  });
});
