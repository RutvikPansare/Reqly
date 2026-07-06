import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// grpc-reflection.test.ts  (T-167)
// TDD tests for gRPC server reflection client.
// Uses manual mocks - no real gRPC server required.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mock state
// ---------------------------------------------------------------------------

const _rMock = {
  shouldFail: false,
  fileDescriptorProtos: [] as Buffer[],
  serviceList: [] as string[],
};

// Fake bidirectional streaming call for ServerReflectionInfo
class FakeReflectionStream {
  private _listeners: Record<string, Function[]> = {};
  private _ended = false;

  on(event: string, fn: Function) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  write(req: any) {
    // Simulate response after write
    setTimeout(() => {
      if (_rMock.shouldFail) {
        this._emit('error', new Error('reflection unavailable'));
        return;
      }

      if (req.list_services === '') {
        // Return service list
        const response = {
          list_services_response: {
            service: _rMock.serviceList.map(name => ({ name })),
          },
        };
        this._emit('data', response);
      } else if (req.file_containing_symbol) {
        // Return file descriptor proto
        const fdp = _rMock.fileDescriptorProtos[0] ?? Buffer.alloc(0);
        const response = {
          file_descriptor_response: {
            file_descriptor_proto: [fdp],
          },
        };
        this._emit('data', response);
      }
    }, 0);
  }

  end() {
    setTimeout(() => {
      if (!this._ended) {
        this._ended = true;
        this._emit('end');
      }
    }, 10);
  }

  private _emit(event: string, data?: any) {
    (this._listeners[event] ?? []).forEach(fn => fn(data));
  }
}

// Fake stub constructor for the reflection service
function FakeReflectionStub(this: any, _url: string, _creds: any) {
  this.ServerReflectionInfo = () => new FakeReflectionStream();
}

vi.mock('@grpc/grpc-js', () => {
  return {
    loadPackageDefinition: vi.fn(() => ({
      grpc: {
        reflection: {
          v1alpha: {
            ServerReflection: FakeReflectionStub,
          },
        },
      },
    })),
    credentials: {
      createInsecure: vi.fn(() => 'insecure-creds'),
      createSsl: vi.fn(() => 'ssl-creds'),
    },
    Metadata: function FakeMeta(this: any) {
      this.add = vi.fn();
    },
    status: { OK: 0 },
  };
});

vi.mock('@grpc/proto-loader', () => ({
  load: vi.fn(async () => ({})),
  loadSync: vi.fn(() => ({})),
}));

import { discoverServicesViaReflection, ReflectionResult } from './grpc-reflection.js';
import * as grpcLoader from '@grpc/proto-loader';
import * as grpcJs from '@grpc/grpc-js';
import { existsSync } from 'fs';

// ---------------------------------------------------------------------------
// Helper to build a minimal serialised FileDescriptorProto binary.
// In real use this is a protobuf-encoded blob, but for tests we just need
// our parser to handle it gracefully (it will return an empty service def
// for unrecognised bytes).
// ---------------------------------------------------------------------------
function makeMinimalFdp(): Buffer {
  // A zero-length buffer represents an empty FileDescriptorProto.
  return Buffer.alloc(0);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('grpc-reflection (T-167)', () => {
  beforeEach(() => {
    _rMock.shouldFail = false;
    _rMock.serviceList = ['helloworld.Greeter', 'grpc.health.v1.Health'];
    _rMock.fileDescriptorProtos = [makeMinimalFdp()];
    vi.clearAllMocks();
  });

  it('discovers the list of services from a reflection-enabled server', async () => {
    const result = await discoverServicesViaReflection('localhost:50051', { insecure: true });

    expect(result.isError).toBeFalsy();
    expect(Array.isArray(result.services)).toBe(true);
    expect(result.services.length).toBeGreaterThan(0);
    expect(result.services.some(s => s.name === 'helloworld.Greeter')).toBe(true);
  });

  it('returns isError when reflection is not available on the server', async () => {
    _rMock.shouldFail = true;

    const result = await discoverServicesViaReflection('localhost:50051', { insecure: true });

    expect(result.isError).toBe(true);
    expect(result.errorMessage).toBeTruthy();
  });

  it('returns service list with name field for each service', async () => {
    _rMock.serviceList = ['mypackage.MyService'];

    const result = await discoverServicesViaReflection('localhost:50051', { insecure: true });

    expect(result.isError).toBeFalsy();
    expect(result.services[0]).toHaveProperty('name');
    expect(result.services[0].name).toBe('mypackage.MyService');
  });

  it('includes rawFileDescriptors array in result for downstream processing', async () => {
    const result = await discoverServicesViaReflection('localhost:50051', { insecure: true });

    expect(result.isError).toBeFalsy();
    expect(Array.isArray(result.rawFileDescriptors)).toBe(true);
  });

  it('loads the real reflection proto and feeds it to loadPackageDefinition (T-243)', async () => {
    // Regression: production used to call loadPackageDefinition({}) - an empty
    // definition that only worked because tests mock loadPackageDefinition.
    // The real proto must be loaded via proto-loader and its result passed on.
    await discoverServicesViaReflection('localhost:50051', { insecure: true });

    expect(grpcLoader.loadSync).toHaveBeenCalledTimes(1);
    const [protoPath] = vi.mocked(grpcLoader.loadSync).mock.calls[0];
    expect(existsSync(protoPath as string)).toBe(true);

    const loadedDef = vi.mocked(grpcLoader.loadSync).mock.results[0].value;
    expect(vi.mocked(grpcJs.loadPackageDefinition)).toHaveBeenCalledWith(loadedDef);
  });

  it('returns error with useful message when server URL is unreachable', async () => {
    _rMock.shouldFail = true;

    const result = await discoverServicesViaReflection('badhost:99999', { insecure: true });

    expect(result.isError).toBe(true);
    expect(typeof result.errorMessage).toBe('string');
  });
});
