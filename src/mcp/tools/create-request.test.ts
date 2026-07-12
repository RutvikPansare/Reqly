import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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

  // T-166: creating a gRPC request with protoFile/service/method should return
  // a message scaffold built from the real proto. Protos live at
  // `<baseDir>/protos/` - the same location run_request and the Express run
  // route resolve them from.
  describe('gRPC message scaffold', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-scaffold-'));
      fs.mkdirSync(path.join(tmpDir, 'protos'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'protos', 'helloworld.proto'),
        `syntax = "proto3";
package helloworld;
service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply) {}
}
message HelloRequest {
  string name = 1;
  int32 age = 2;
}
message HelloReply {
  string message = 1;
}
`,
      );
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns grpcMessageScaffold for a grpc request', async () => {
      const mockContext: any = {
        collectionManager: {
          addRequest: async () => {},
          getBaseDir: () => tmpDir,
        },
      };
      const res = await handler({
        collectionName: 'C1',
        request: {
          id: '1',
          name: 'SayHello',
          method: 'POST',
          url: 'localhost:50051',
          type: 'grpc',
          grpc: { protoFile: 'helloworld.proto', service: 'helloworld.Greeter', method: 'SayHello' },
        },
      }, mockContext);
      expect(res.isError).toBeFalsy();
      const parsed = JSON.parse(res.content[0].text as string);
      expect(parsed.success).toBe(true);
      expect(parsed.grpcMessageScaffold).toBeDefined();
      expect(parsed.grpcMessageScaffold).toHaveProperty('name');
      expect(parsed.grpcMessageScaffold).toHaveProperty('age');
    });
  });

});
