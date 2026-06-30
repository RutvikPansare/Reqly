import { describe, it, expect } from 'vitest';
import { definition, handler } from './create-request.js';

describe('create-request', () => {
  it('should have correct definition', () => {
    expect(definition.name).toBe('create_request');
  });

  it('should return successful result', async () => {
    const mockContext: any = {
      collectionManager: {
        addRequest: async () => {}
      }
    };
    const res = await handler({ collectionName: 'C1', request: { id: '1', name: 'R1', method: 'GET', url: 'http://foo' } }, mockContext);
    expect(res.content[0].text).toContain('true');
    expect(res.isError).toBeFalsy();
  });

  it('should include multipart body schema with parts array in the input schema', () => {
    const bodySchema = definition.inputSchema.properties.request.properties.body;
    expect(bodySchema).toBeDefined();
    // Body should support oneOf with a multipart variant
    const multipartVariant = bodySchema.oneOf?.find(
      (v: any) => v.properties?.type?.enum?.includes('multipart')
    );
    expect(multipartVariant).toBeDefined();
    expect(multipartVariant.properties.parts.type).toBe('array');
    const partItem = multipartVariant.properties.parts.items;
    expect(partItem.properties.name).toBeDefined();
    expect(partItem.properties.type.enum).toContain('text');
    expect(partItem.properties.type.enum).toContain('file');
    expect(partItem.properties.filePath).toBeDefined();
    expect(partItem.properties.contentType).toBeDefined();
  });

  it('description should mention multipart and filePath', () => {
    expect(definition.description).toContain('multipart');
    expect(definition.description).toContain('filePath');
  });

});
