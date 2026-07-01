import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// grpc-runner.test.ts  (T-164, T-165)
// TDD tests for gRPC unary execution engine + auth/metadata injection.
// Uses manual mocks - no real gRPC server required.
// ---------------------------------------------------------------------------

// Hoisted mock state shared between the factory and the helpers below.
// We use a module-level object so helper functions can mutate the stubs.
const _mock = {
  callResult: null as any,
  callError: null as any,
  metadataAddSpy: vi.fn(),
  loadShouldFail: false,
};

vi.mock('@grpc/proto-loader', () => ({
  load: vi.fn(async () => {
    if (_mock.loadShouldFail) {
      throw new Error('ENOENT: no such file or directory');
    }
    return {};
  }),
  loadSync: vi.fn(() => ({})),
}));

// All constructors in the mock MUST use function syntax (not arrow functions)
// because they are used with `new`.
vi.mock('@grpc/grpc-js', () => {
  // Fake stub constructor - exposes SayHello and GetUser as call methods.
  function FakeStub(this: any, _url: string, _creds: any) {
    this.SayHello = function (_req: any, _meta: any, cb: Function) {
      if (_mock.callError) { cb(_mock.callError, null); }
      else { cb(null, _mock.callResult); }
    };
    this.GetUser = function (_req: any, _meta: any, cb: Function) {
      if (_mock.callError) { cb(_mock.callError, null); }
      else { cb(null, _mock.callResult); }
    };
  }

  function FakeMetadata(this: any) {
    this.add = _mock.metadataAddSpy;
  }

  const fakePkg: any = {
    helloworld: { Greeter: FakeStub },
    userservice: { UserService: FakeStub },
  };

  return {
    loadPackageDefinition: vi.fn(() => fakePkg),
    credentials: {
      createInsecure: vi.fn(() => 'insecure-creds'),
      createSsl: vi.fn(() => 'ssl-creds'),
    },
    Metadata: FakeMetadata,
    status: { OK: 0, NOT_FOUND: 5, UNIMPLEMENTED: 12, UNAVAILABLE: 14 },
  };
});

import * as grpcLoader from '@grpc/proto-loader';
import * as grpcJs from '@grpc/grpc-js';

import { runGrpcRequest, GrpcRequest } from './grpc-runner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setSuccess(response: any) {
  _mock.callResult = response;
  _mock.callError = null;
  _mock.loadShouldFail = false;
}

function setGrpcError(code: number, details = 'mock error details') {
  const err: any = new Error('gRPC error');
  err.code = code;
  err.details = details;
  _mock.callResult = null;
  _mock.callError = err;
  _mock.loadShouldFail = false;
}

const BASIC_REQ: GrpcRequest = {
  serverUrl: 'localhost:50051',
  protoFile: 'helloworld.proto',
  service: 'helloworld.Greeter',
  method: 'SayHello',
  message: { name: 'World' },
  insecure: true,
};

// ---------------------------------------------------------------------------
// T-164: Core gRPC engine - unary RPCs + multi-file proto support
// ---------------------------------------------------------------------------

describe('grpc-runner (T-164)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _mock.metadataAddSpy = vi.fn();
    _mock.loadShouldFail = false;
  });

  it('executes a unary RPC and returns decoded response', async () => {
    setSuccess({ message: 'Hello World' });

    const result = await runGrpcRequest(BASIC_REQ, '/tmp/protos');

    expect(result.grpcStatus).toBe('OK');
    expect(result.grpcStatusCode).toBe(0);
    expect(result.body).toEqual({ message: 'Hello World' });
    expect(typeof result.latency).toBe('number');
    expect(result.latency).toBeGreaterThanOrEqual(0);
    expect(result.isError).toBeUndefined();
  });

  it('returns gRPC error status cleanly (NOT_FOUND = 5)', async () => {
    setGrpcError(5);

    const result = await runGrpcRequest(BASIC_REQ, '/tmp/protos');

    expect(result.grpcStatus).toBe('NOT_FOUND');
    expect(result.grpcStatusCode).toBe(5);
    expect(result.isError).toBe(true);
    expect(result.body).toBeNull();
    expect(result.errorMessage).toBeTruthy();
  });

  it('returns UNIMPLEMENTED status (code 12)', async () => {
    setGrpcError(12);

    const result = await runGrpcRequest(BASIC_REQ, '/tmp/protos');

    expect(result.grpcStatus).toBe('UNIMPLEMENTED');
    expect(result.grpcStatusCode).toBe(12);
    expect(result.isError).toBe(true);
  });

  it('returns error when proto file is not found', async () => {
    _mock.loadShouldFail = true;

    const result = await runGrpcRequest(BASIC_REQ, '/tmp/protos');

    expect(result.isError).toBe(true);
    expect(result.errorMessage).toMatch(/proto/i);
    expect(result.grpcStatusCode).toBe(2); // UNKNOWN
  });

  it('passes includeDirs containing protosDir to proto-loader', async () => {
    setSuccess({ id: '123' });

    const protosDir = '/project/.reqly/protos';
    await runGrpcRequest(
      { ...BASIC_REQ, service: 'userservice.UserService', method: 'GetUser', protoFile: 'user.proto' },
      protosDir,
    );

    const loadCall = vi.mocked(grpcLoader.load as any).mock.calls[0];
    const options = loadCall[1];
    expect(Array.isArray(options.includeDirs)).toBe(true);
    expect(options.includeDirs).toContain(protosDir);
  });

  it('includes latency in the response', async () => {
    setSuccess({ ok: true });

    const result = await runGrpcRequest(BASIC_REQ, '/tmp/protos');

    expect(typeof result.latency).toBe('number');
    expect(result.latency).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// T-165: gRPC metadata + auth integration
// ---------------------------------------------------------------------------

describe('grpc-runner auth + metadata (T-165)', () => {
  beforeEach(() => {
    _mock.callResult = { ok: true };
    _mock.callError = null;
    _mock.loadShouldFail = false;
    _mock.metadataAddSpy = vi.fn();
  });

  it('injects bearer token as authorization metadata', async () => {
    const result = await runGrpcRequest(
      { ...BASIC_REQ, metadata: { authorization: 'Bearer token123' } },
      '/tmp/protos',
    );

    expect(result.isError).toBeUndefined();
    expect(_mock.metadataAddSpy).toHaveBeenCalledWith('authorization', 'Bearer token123');
  });

  it('injects API key as x-api-key metadata', async () => {
    await runGrpcRequest(
      { ...BASIC_REQ, metadata: { 'x-api-key': 'mykey' } },
      '/tmp/protos',
    );

    expect(_mock.metadataAddSpy).toHaveBeenCalledWith('x-api-key', 'mykey');
  });

  it('sends no metadata when no metadata provided', async () => {
    await runGrpcRequest(BASIC_REQ, '/tmp/protos');

    expect(_mock.metadataAddSpy).not.toHaveBeenCalled();
  });

  it('merges multiple metadata entries', async () => {
    await runGrpcRequest(
      {
        ...BASIC_REQ,
        metadata: {
          authorization: 'Bearer explicit',
          'x-custom': 'value',
        },
      },
      '/tmp/protos',
    );

    expect(_mock.metadataAddSpy).toHaveBeenCalledWith('authorization', 'Bearer explicit');
    expect(_mock.metadataAddSpy).toHaveBeenCalledWith('x-custom', 'value');
  });
});
