import { expect, test, describe } from 'vitest';
import { exportToDocs } from './exporter.js';
import type { Collection } from '../types/index.js';

describe('exportToDocs', () => {
  test('exports empty collection', () => {
    const col: Collection = {
      name: 'Empty',
      description: 'An empty collection',
      requests: []
    };
    
    const out = exportToDocs(col);
    expect(out).toBe('# Empty\\n\\nAn empty collection\\n');
  });

  test('exports collection with headers, body, and examples', () => {
    const col: Collection = {
      name: 'Test API',
      requests: [
        {
          id: '1',
          name: 'Create User',
          method: 'POST',
          url: 'https://api.example.com/users',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token' },
          params: { 'role': 'admin' },
          body: { name: 'Alice', email: 'alice@example.com' },
          examples: [
            {
              id: 'ex1',
              name: 'Success',
              status: 201,
              latency: 50,
              savedAt: new Date().toISOString(),
              headers: { 'Content-Type': 'application/json' },
              body: { id: 123, name: 'Alice', email: 'alice@example.com' }
            }
          ]
        }
      ]
    };

    const out = exportToDocs(col);
    
    expect(out).toContain('# Test API');
    expect(out).toContain('## Create User');
    expect(out).toContain('**POST** `https://api.example.com/users`');
    
    expect(out).toContain('### Headers');
    expect(out).toContain('| `Content-Type` | `application/json` |');
    expect(out).toContain('| `Authorization` | `Bearer token` |');
    
    expect(out).toContain('### Parameters');
    expect(out).toContain('| `role` | `admin` |');
    
    expect(out).toContain('### Request Body');
    expect(out).toContain('```json');
    expect(out).toContain('"name": "Alice"');
    
    expect(out).toContain('### Examples');
    expect(out).toContain('#### Success');
    expect(out).toContain('**Status:** 201');
    expect(out).toContain('"id": 123');
  });

  test('exports multipart body correctly', () => {
    const col: Collection = {
      name: 'Upload API',
      requests: [
        {
          id: '1',
          name: 'Upload File',
          method: 'POST',
          url: 'https://api.example.com/upload',
          body: {
            type: 'multipart',
            parts: [
              { name: 'metadata', type: 'text', value: '{"type":"image"}' },
              { name: 'file', type: 'file', filePath: 'avatar.png' }
            ]
          }
        }
      ]
    };

    const out = exportToDocs(col);
    expect(out).toContain('### Request Body');
    expect(out).toContain('**Type:** `multipart/form-data`');
    expect(out).toContain('| `metadata` | `text` | `{"type":"image"}` |');
    expect(out).toContain('| `file` | `file` | `avatar.png` |');
  });
});
