import { describe, it, expect, vi } from 'vitest';
import { definition, handler } from './introspect-graphql.js';

// Minimal introspection response shape
const MOCK_SCHEMA = {
  queryType: { name: 'Query' },
  mutationType: null,
  subscriptionType: null,
  types: [
    {
      kind: 'OBJECT',
      name: 'Query',
      description: 'The root query type',
      fields: [
        {
          name: 'user',
          description: 'Fetch a user by id',
          type: { kind: 'OBJECT', name: 'User', ofType: null },
          args: [{ name: 'id', description: 'User ID', type: { kind: 'SCALAR', name: 'ID', ofType: null } }],
        },
      ],
      inputFields: null,
      enumValues: null,
    },
    {
      kind: 'OBJECT',
      name: 'User',
      description: 'A user object',
      fields: [
        { name: 'id', description: null, type: { kind: 'SCALAR', name: 'ID', ofType: null }, args: [] },
        { name: 'name', description: null, type: { kind: 'SCALAR', name: 'String', ofType: null }, args: [] },
      ],
      inputFields: null,
      enumValues: null,
    },
    { kind: 'SCALAR', name: 'String', description: null, fields: null, inputFields: null, enumValues: null },
    { kind: 'SCALAR', name: 'ID', description: null, fields: null, inputFields: null, enumValues: null },
    { kind: 'SCALAR', name: '__Schema', description: null, fields: null, inputFields: null, enumValues: null },
  ],
};

function makeContext(overrides: any = {}) {
  return {
    collectionManager: {
      getBaseDir: () => '/project/.reqly',
      ...(overrides.collectionManager ?? {}),
    },
    ...overrides,
  };
}

vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

import { fetch } from 'undici';

describe('introspect-graphql tool', () => {
  it('has the correct definition', () => {
    expect(definition.name).toBe('introspect_graphql');
    expect(definition.inputSchema.required).toContain('url');
    expect(definition.description).toMatch(/introspect/i);
  });

  it('returns structured types on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { __schema: MOCK_SCHEMA } }),
    } as any);

    const res = await handler({ url: 'https://api.example.com/graphql' }, makeContext() as any);
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.queryType).toBe('Query');
    expect(parsed.mutationType).toBeNull();
    expect(parsed.types).toBeInstanceOf(Array);
    // Internal __Schema type should be filtered out
    expect(parsed.types.find((t: any) => t.name === '__Schema')).toBeUndefined();
    // Query and User should be present
    const queryType = parsed.types.find((t: any) => t.name === 'Query');
    expect(queryType).toBeDefined();
    expect(queryType.fields[0].name).toBe('user');
    expect(queryType.fields[0].args[0].name).toBe('id');
  });

  it('forwards custom auth headers to the endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { __schema: MOCK_SCHEMA } }),
    } as any);

    await handler(
      { url: 'https://api.example.com/graphql', headers: { Authorization: 'Bearer tok123' } },
      makeContext() as any
    );
    const calledOptions = vi.mocked(fetch).mock.lastCall?.[1] as any;
    expect(calledOptions.headers['Authorization']).toBe('Bearer tok123');
  });

  it('returns isError: true for invalid URL', async () => {
    const res = await handler({ url: '' }, makeContext() as any);
    expect(res.isError).toBe(true);
  });

  it('returns isError: true and a helpful message when introspection returns 403', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as any);

    const res = await handler({ url: 'https://api.example.com/graphql' }, makeContext() as any);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/403|forbidden|introspection disabled/i);
  });
});
