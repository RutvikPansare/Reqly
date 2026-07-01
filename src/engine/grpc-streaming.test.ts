import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// grpc-streaming.test.ts  (T-168)
// TDD tests for server/client/bidirectional gRPC streaming.
// Uses manual mocks - no real gRPC server required.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mock state
// ---------------------------------------------------------------------------

const _sMock = {
  serverStreamMessages: [] as any[],
  serverStreamError: null as any,
  clientStreamResponse: null as any,
  clientStreamError: null as any,
  delay: 0,
};

// ---- Fake server-streaming call ----
class FakeServerStream {
  private _listeners: Record<string, Function[]> = {};

  on(event: string, fn: Function) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  start() {
    const self = this;
    setTimeout(() => {
      if (_sMock.serverStreamError) {
        self._emit('error', _sMock.serverStreamError);
        return;
      }
      for (const msg of _sMock.serverStreamMessages) {
        self._emit('data', msg);
      }
      self._emit('status', { code: 0 });
      self._emit('end');
    }, _sMock.delay);
  }

  _emit(event: string, data?: any) {
    (this._listeners[event] ?? []).forEach(fn => fn(data));
  }
}

// ---- Fake client-streaming call ----
class FakeClientStream {
  private _listeners: Record<string, Function[]> = {};
  public written: any[] = [];

  on(event: string, fn: Function) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  write(msg: any) { this.written.push(msg); }

  end() {
    const self = this;
    setTimeout(() => {
      if (_sMock.clientStreamError) {
        self._emit('error', _sMock.clientStreamError);
      } else {
        self._emit('data', _sMock.clientStreamResponse);
        self._emit('status', { code: 0 });
        self._emit('end');
      }
    }, _sMock.delay);
  }

  _emit(event: string, data?: any) {
    (this._listeners[event] ?? []).forEach(fn => fn(data));
  }
}

// ---- Fake bidirectional streaming call ----
class FakeBidiStream {
  private _listeners: Record<string, Function[]> = {};
  public written: any[] = [];
  private _msgIdx = 0;

  on(event: string, fn: Function) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  write(msg: any) {
    this.written.push(msg);
    const self = this;
    const response = _sMock.serverStreamMessages[this._msgIdx++];
    if (response !== undefined) {
      setTimeout(() => {
        self._emit('data', response);
      }, 0);
    }
  }

  end() {
    const self = this;
    setTimeout(() => {
      self._emit('status', { code: 0 });
      self._emit('end');
    }, _sMock.delay);
  }

  _emit(event: string, data?: any) {
    (this._listeners[event] ?? []).forEach(fn => fn(data));
  }
}

// ---- Fake gRPC stub ----
function FakeStreamingStub(this: any, _url: string, _creds: any) {
  this.ServerStream = (_msg: any, _meta: any) => {
    const s = new FakeServerStream();
    s.start();
    return s;
  };
  this.ClientStream = (_meta: any) => new FakeClientStream();
  this.BidiStream = (_meta: any) => new FakeBidiStream();
}

vi.mock('@grpc/grpc-js', () => {
  const pkg: any = {
    myservice: { StreamService: FakeStreamingStub },
  };
  return {
    loadPackageDefinition: vi.fn(() => pkg),
    credentials: {
      createInsecure: vi.fn(() => 'insecure-creds'),
      createSsl: vi.fn(() => 'ssl-creds'),
    },
    Metadata: function FakeMeta(this: any) { this.add = vi.fn(); },
    status: { OK: 0 },
  };
});

vi.mock('@grpc/proto-loader', () => ({
  load: vi.fn(async () => ({})),
  loadSync: vi.fn(() => ({})),
}));

import { runGrpcServerStream, runGrpcClientStream, runGrpcBidiStream } from './grpc-streaming.js';

// ---------------------------------------------------------------------------
// Base request shape
// ---------------------------------------------------------------------------

const BASE = {
  serverUrl: 'localhost:50051',
  protoFile: 'stream.proto',
  service: 'myservice.StreamService',
  insecure: true as const,
};

// ---------------------------------------------------------------------------
// T-168: Server streaming
// ---------------------------------------------------------------------------

describe('grpc-streaming - server streaming (T-168)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _sMock.serverStreamMessages = [{ value: 1 }, { value: 2 }, { value: 3 }];
    _sMock.serverStreamError = null;
    _sMock.clientStreamResponse = null;
    _sMock.clientStreamError = null;
    _sMock.delay = 0;
  });

  it('collects all server-streaming messages', async () => {
    const result = await runGrpcServerStream(
      { ...BASE, method: 'ServerStream', message: { n: 3 } },
      '/tmp/protos',
    );

    expect(result.isError).toBeFalsy();
    expect(result.messages.filter(m => m.direction === 'received')).toHaveLength(3);
    expect(result.messages[0].data).toEqual({ value: 1 });
    expect(result.truncated).toBe(false);
  }, 10_000);

  it('returns truncated:true when timeout fires before stream ends', async () => {
    _sMock.delay = 500;

    const result = await runGrpcServerStream(
      { ...BASE, method: 'ServerStream', message: {}, streamTimeout: 0.1 },
      '/tmp/protos',
    );

    expect(result.truncated).toBe(true);
  }, 10_000);

  it('returns isError when stream errors out', async () => {
    const err: any = new Error('stream failed');
    err.code = 14;
    err.details = 'UNAVAILABLE';
    _sMock.serverStreamError = err;

    const result = await runGrpcServerStream(
      { ...BASE, method: 'ServerStream', message: {} },
      '/tmp/protos',
    );

    expect(result.isError).toBe(true);
    expect(result.errorMessage).toBeTruthy();
  }, 10_000);

  it('each message has a timestamp and direction', async () => {
    _sMock.serverStreamMessages = [{ x: 1 }];

    const result = await runGrpcServerStream(
      { ...BASE, method: 'ServerStream', message: {} },
      '/tmp/protos',
    );

    const received = result.messages.filter(m => m.direction === 'received');
    expect(received[0]).toHaveProperty('timestamp');
    expect(typeof received[0].timestamp).toBe('string');
    expect(received[0].direction).toBe('received');
  }, 10_000);
});

// ---------------------------------------------------------------------------
// T-168: Client streaming
// ---------------------------------------------------------------------------

describe('grpc-streaming - client streaming (T-168)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _sMock.serverStreamMessages = [];
    _sMock.clientStreamResponse = { total: 42 };
    _sMock.clientStreamError = null;
    _sMock.delay = 0;
  });

  it('sends all messages and returns the server response', async () => {
    const msgs = [{ x: 1 }, { x: 2 }];

    const result = await runGrpcClientStream(
      { ...BASE, method: 'ClientStream', messages: msgs },
      '/tmp/protos',
    );

    expect(result.isError).toBeFalsy();
    expect(result.response).toEqual({ total: 42 });
  }, 10_000);

  it('returns isError when client stream call fails', async () => {
    const err: any = new Error('client stream failed');
    err.code = 2;
    _sMock.clientStreamError = err;

    const result = await runGrpcClientStream(
      { ...BASE, method: 'ClientStream', messages: [{ x: 1 }] },
      '/tmp/protos',
    );

    expect(result.isError).toBe(true);
  }, 10_000);
});

// ---------------------------------------------------------------------------
// T-168: Bidirectional streaming
// ---------------------------------------------------------------------------

describe('grpc-streaming - bidirectional streaming (T-168)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _sMock.serverStreamMessages = [{ echo: 'a' }, { echo: 'b' }];
    _sMock.serverStreamError = null;
    _sMock.clientStreamError = null;
    _sMock.delay = 0;
  });

  it('sends all messages and collects interleaved responses', async () => {
    const msgs = [{ send: 'a' }, { send: 'b' }];

    const result = await runGrpcBidiStream(
      { ...BASE, method: 'BidiStream', messages: msgs },
      '/tmp/protos',
    );

    expect(result.isError).toBeFalsy();
    // Sent 2 messages + received 2 echo responses
    expect(result.messages.some(m => m.direction === 'sent')).toBe(true);
    expect(result.messages.some(m => m.direction === 'received')).toBe(true);
  }, 10_000);

  it('returns truncated:true when timeout fires before bidi stream ends', async () => {
    _sMock.delay = 500;

    const result = await runGrpcBidiStream(
      { ...BASE, method: 'BidiStream', messages: [{ x: 1 }], streamTimeout: 0.1 },
      '/tmp/protos',
    );

    expect(result.truncated).toBe(true);
  }, 10_000);
});
