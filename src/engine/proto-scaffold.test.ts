import { describe, it, expect } from 'vitest';
import { scaffoldMessage } from './proto-scaffold.js';

// ---------------------------------------------------------------------------
// proto-scaffold.test.ts  (T-166)
// TDD tests for JSON message scaffold generation from proto field descriptors.
// scaffoldMessage takes a proto field descriptor array (as returned by
// @grpc/proto-loader with `defaults: true`) and produces a JSON object
// pre-populated with sensible defaults, ready for the user to edit.
// ---------------------------------------------------------------------------

// A proto field descriptor subset - proto-loader returns a richer object
// but we only need name + type (or 'message' with fields) to scaffold.
// This mirrors the structure we extract from packageDef to build scaffolds.

describe('proto-scaffold (T-166)', () => {
  it('scaffolds scalar string field', () => {
    const result = scaffoldMessage([
      { name: 'name', type: 'string' },
    ]);
    expect(result).toEqual({ name: '' });
  });

  it('scaffolds scalar numeric fields (int32, float, double)', () => {
    const result = scaffoldMessage([
      { name: 'count', type: 'int32' },
      { name: 'score', type: 'float' },
      { name: 'price', type: 'double' },
      { name: 'big', type: 'int64' },
      { name: 'ubig', type: 'uint64' },
    ]);
    expect(result).toEqual({ count: 0, score: 0, price: 0, big: 0, ubig: 0 });
  });

  it('scaffolds bool field', () => {
    const result = scaffoldMessage([
      { name: 'active', type: 'bool' },
    ]);
    expect(result).toEqual({ active: false });
  });

  it('scaffolds bytes field', () => {
    const result = scaffoldMessage([
      { name: 'data', type: 'bytes' },
    ]);
    expect(result).toEqual({ data: '' });
  });

  it('scaffolds repeated field as empty array', () => {
    const result = scaffoldMessage([
      { name: 'tags', type: 'string', repeated: true },
    ]);
    expect(result).toEqual({ tags: [] });
  });

  it('scaffolds repeated numeric field as empty array', () => {
    const result = scaffoldMessage([
      { name: 'scores', type: 'int32', repeated: true },
    ]);
    expect(result).toEqual({ scores: [] });
  });

  it('scaffolds nested message type recursively', () => {
    const result = scaffoldMessage([
      {
        name: 'address',
        type: 'message',
        fields: [
          { name: 'street', type: 'string' },
          { name: 'zip', type: 'int32' },
        ],
      },
    ]);
    expect(result).toEqual({ address: { street: '', zip: 0 } });
  });

  it('scaffolds repeated nested message as array', () => {
    const result = scaffoldMessage([
      {
        name: 'items',
        type: 'message',
        repeated: true,
        fields: [
          { name: 'id', type: 'string' },
          { name: 'qty', type: 'int32' },
        ],
      },
    ]);
    expect(result).toEqual({ items: [] });
  });

  it('scaffolds oneof field as null', () => {
    const result = scaffoldMessage([
      { name: 'payload', type: 'oneof' },
    ]);
    expect(result).toEqual({ payload: null });
  });

  it('scaffolds enum field as 0', () => {
    const result = scaffoldMessage([
      { name: 'status', type: 'enum' },
    ]);
    expect(result).toEqual({ status: 0 });
  });

  it('scaffolds well-known Timestamp type', () => {
    const result = scaffoldMessage([
      {
        name: 'created_at',
        type: 'message',
        typeName: 'google.protobuf.Timestamp',
        fields: [
          { name: 'seconds', type: 'int64' },
          { name: 'nanos', type: 'int32' },
        ],
      },
    ]);
    expect(result).toEqual({ created_at: { seconds: 0, nanos: 0 } });
  });

  it('scaffolds well-known Duration type', () => {
    const result = scaffoldMessage([
      {
        name: 'ttl',
        type: 'message',
        typeName: 'google.protobuf.Duration',
        fields: [
          { name: 'seconds', type: 'int64' },
          { name: 'nanos', type: 'int32' },
        ],
      },
    ]);
    expect(result).toEqual({ ttl: { seconds: 0, nanos: 0 } });
  });

  it('scaffolds mixed field message correctly', () => {
    const result = scaffoldMessage([
      { name: 'id', type: 'string' },
      { name: 'active', type: 'bool' },
      { name: 'score', type: 'double' },
      { name: 'tags', type: 'string', repeated: true },
      {
        name: 'address',
        type: 'message',
        fields: [
          { name: 'city', type: 'string' },
        ],
      },
    ]);
    expect(result).toEqual({
      id: '',
      active: false,
      score: 0,
      tags: [],
      address: { city: '' },
    });
  });

  it('returns empty object for empty field list', () => {
    const result = scaffoldMessage([]);
    expect(result).toEqual({});
  });
});
