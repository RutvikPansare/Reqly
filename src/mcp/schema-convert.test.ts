import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { convertSchemaToZodShape } from '../mcp/server.js';

describe('convertSchemaToZodShape', () => {
  it('maps string type to z.string()', () => {
    const shape = convertSchemaToZodShape({ properties: { name: { type: 'string' } }, required: ['name'] });
    expect(() => z.object(shape).parse({ name: 'foo' })).not.toThrow();
    expect(() => z.object(shape).parse({ name: 123 })).toThrow();
  });

  it('maps number type to z.number()', () => {
    const shape = convertSchemaToZodShape({ properties: { count: { type: 'number' } }, required: ['count'] });
    expect(z.object(shape).parse({ count: 5 }).count).toBe(5);
  });

  it('maps boolean type to z.boolean()', () => {
    const shape = convertSchemaToZodShape({ properties: { flag: { type: 'boolean' } }, required: ['flag'] });
    expect(z.object(shape).parse({ flag: true }).flag).toBe(true);
  });

  it('maps object type - accepts plain object', () => {
    const shape = convertSchemaToZodShape({ properties: { request: { type: 'object' } }, required: ['request'] });
    const result = z.object(shape).parse({ request: { name: 'R1', method: 'GET' } });
    expect(result.request).toEqual({ name: 'R1', method: 'GET' });
  });

  it('maps object type - parses JSON string (Claude Code MCP compat)', () => {
    const shape = convertSchemaToZodShape({ properties: { request: { type: 'object' } }, required: ['request'] });
    const result = z.object(shape).parse({ request: JSON.stringify({ name: 'R1', method: 'GET', url: 'http://foo' }) });
    expect(result.request).toEqual({ name: 'R1', method: 'GET', url: 'http://foo' });
  });

  it('maps array type - accepts plain array', () => {
    const shape = convertSchemaToZodShape({ properties: { items: { type: 'array' } }, required: ['items'] });
    const result = z.object(shape).parse({ items: [1, 2, 3] });
    expect(result.items).toEqual([1, 2, 3]);
  });

  it('maps array type - parses JSON string', () => {
    const shape = convertSchemaToZodShape({ properties: { items: { type: 'array' } }, required: ['items'] });
    const result = z.object(shape).parse({ items: JSON.stringify(['a', 'b']) });
    expect(result.items).toEqual(['a', 'b']);
  });

  it('makes non-required fields optional', () => {
    const shape = convertSchemaToZodShape({
      properties: { name: { type: 'string' }, extra: { type: 'string' } },
      required: ['name']
    });
    expect(() => z.object(shape).parse({ name: 'foo' })).not.toThrow();
  });

  it('makes all fields optional when the schema has no required array (T-243)', () => {
    // get_variables declares { environment?, collectionName? } with no
    // `required` key at all - calling it with {} must validate.
    const shape = convertSchemaToZodShape({
      properties: { environment: { type: 'string' }, collectionName: { type: 'string' } }
    });
    expect(() => z.object(shape).parse({})).not.toThrow();
  });

  it('returns empty shape for schema with no properties', () => {
    expect(convertSchemaToZodShape(null)).toEqual({});
    expect(convertSchemaToZodShape({})).toEqual({});
  });
});
