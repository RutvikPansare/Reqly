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
  lastCallOptions: undefined as any,
  closeClientSpy: vi.fn(),
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
  // Accepts both (req, meta, cb) and (req, meta, options, cb) signatures and
  // records the options object so tests can assert on the deadline.
  function makeCallMethod() {
    return function (_req: any, _meta: any, optsOrCb: any, maybeCb?: Function) {
      const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb!;
      _mock.lastCallOptions = typeof optsOrCb === 'function' ? undefined : optsOrCb;
      if (_mock.callError) { cb(_mock.callError, null); }
      else { cb(null, _mock.callResult); }
    };
  }
  function FakeStub(this: any, _url: string, _creds: any) {
    this.SayHello = makeCallMethod();
    this.GetUser = makeCallMethod();
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
    closeClient: vi.fn((client: any) => _mock.closeClientSpy(client)),
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

// ---------------------------------------------------------------------------
// T-251: hardening - deadlines, channel cleanup, proto path safety
// ---------------------------------------------------------------------------

describe('grpc-runner hardening (T-251)', () => {
  beforeEach(() => {
    _mock.callResult = { ok: true };
    _mock.callError = null;
    _mock.loadShouldFail = false;
    _mock.lastCallOptions = undefined;
    _mock.metadataAddSpy = vi.fn();
    _mock.closeClientSpy = vi.fn();
    vi.clearAllMocks();
  });

  it('passes a default 30s deadline in the call options', async () => {
    const before = Date.now();
    await runGrpcRequest(BASIC_REQ, '/tmp/protos');
    const deadline = _mock.lastCallOptions?.deadline;
    expect(deadline).toBeInstanceOf(Date);
    const delta = (deadline as Date).getTime() - before;
    expect(delta).toBeGreaterThan(29_000);
    expect(delta).toBeLessThan(31_000);
  });

  it('honors a custom timeoutMs for the deadline', async () => {
    const before = Date.now();
    await runGrpcRequest({ ...BASIC_REQ, timeoutMs: 5_000 }, '/tmp/protos');
    const deadline = _mock.lastCallOptions?.deadline as Date;
    const delta = deadline.getTime() - before;
    expect(delta).toBeGreaterThan(4_000);
    expect(delta).toBeLessThan(6_000);
  });

  it('closes the client channel after a successful call', async () => {
    await runGrpcRequest(BASIC_REQ, '/tmp/protos');
    expect(vi.mocked(grpcJs.closeClient)).toHaveBeenCalledTimes(1);
  });

  it('closes the client channel after a failed call', async () => {
    setGrpcError(14, 'unavailable');
    await runGrpcRequest(BASIC_REQ, '/tmp/protos');
    expect(vi.mocked(grpcJs.closeClient)).toHaveBeenCalledTimes(1);
  });

  it('rejects a protoFile that escapes the protos dir', async () => {
    const result = await runGrpcRequest(
      { ...BASIC_REQ, protoFile: '../../etc/passwd' },
      '/tmp/protos',
    );
    expect(result.isError).toBe(true);
    expect(result.errorMessage).toMatch(/protos/i);
    expect(vi.mocked(grpcLoader.load)).not.toHaveBeenCalled();
  });
});
