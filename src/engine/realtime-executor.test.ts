import { describe, it, expect, vi } from 'vitest';
import { runRealtimeCapture } from './realtime-executor.js';
import type { WsLike, EsLike, SioLike, MqttLike, RealtimeAdapters } from './realtime-executor.js';

// ---------------------------------------------------------------------------
// realtime-executor.test.ts  (T-186)
//
// Uses injectable adapters - no vi.mock() needed. Each test builds a fake
// connection object and injects it via the adapters parameter.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fake builders
// ---------------------------------------------------------------------------

function makeFakeWs(): WsLike & { _emit: (e: string, ...a: any[]) => void; send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } {
  const listeners: Record<string, Function[]> = {};
  return {
    on(event: string, fn: (...args: any[]) => void) { (listeners[event] = listeners[event] ?? []).push(fn); },
    send: vi.fn(),
    close: vi.fn(),
    _emit(event: string, ...args: any[]) { (listeners[event] ?? []).forEach(fn => fn(...args)); },
  } as any;
}

function makeFakeEs(): EsLike & { _emitOpen: () => void; _emitEvent: (type: string, data: string) => void; _emitError: (err: any) => void; close: ReturnType<typeof vi.fn> } {
  const listeners: Record<string, Function[]> = {};
  const fake = {
    onopen: null as ((evt: any) => void) | null,
    onerror: null as ((err: any) => void) | null,
    addEventListener(event: string, fn: (...args: any[]) => void) { (listeners[event] = listeners[event] ?? []).push(fn); },
    close: vi.fn(),
    _emitOpen() { fake.onopen?.({}); },
    _emitEvent(type: string, data: string) { (listeners[type] ?? []).forEach(fn => fn({ data })); },
    _emitError(err: any) { fake.onerror?.(err); },
  };
  return fake as any;
}

function makeFakeSio(): SioLike & { _emit: (e: string, ...a: any[]) => void; _fireAny: (e: string, ...a: any[]) => void; emit: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> } {
  const listeners: Record<string, Function[]> = {};
  let anyHandler: ((...args: any[]) => void) | undefined;
  return {
    on(event: string, fn: (...args: any[]) => void) { (listeners[event] = listeners[event] ?? []).push(fn); },
    onAny(fn: (...args: any[]) => void) { anyHandler = fn; },
    emit: vi.fn(),
    disconnect: vi.fn(),
    _emit(event: string, ...args: any[]) { (listeners[event] ?? []).forEach(fn => fn(...args)); },
    _fireAny(event: string, ...args: any[]) { anyHandler?.(event, ...args); },
  } as any;
}

function makeFakeMqtt(): MqttLike & { _emit: (e: string, ...a: any[]) => void; subscribe: ReturnType<typeof vi.fn>; publish: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  const listeners: Record<string, Function[]> = {};
  return {
    on(event: string, fn: (...args: any[]) => void) { (listeners[event] = listeners[event] ?? []).push(fn); },
    subscribe: vi.fn((_t: any, _o: any, cb?: Function) => cb?.(null)),
    publish: vi.fn((_t: any, _m: any, _o: any, cb?: Function) => cb?.(null)),
    end: vi.fn(),
    _emit(event: string, ...args: any[]) { (listeners[event] ?? []).forEach(fn => fn(...args)); },
  } as any;
}

// ---------------------------------------------------------------------------
// WebSocket tests
// ---------------------------------------------------------------------------

describe('runRealtimeCapture - WebSocket', () => {
  it('captures server messages', async () => {
    const ws = makeFakeWs();
    const adapters: RealtimeAdapters = { createWebSocket: () => ws };

    setImmediate(() => {
      ws._emit('open');
      ws._emit('message', Buffer.from('hello'));
      ws._emit('message', Buffer.from('world'));
    });

    const result = await runRealtimeCapture(
      { type: 'websocket', url: 'ws://localhost:9999', config: {} },
      { captureTimeout: 0.1 },
      adapters,
    );

    expect(result.isError).toBeFalsy();
    const serverMsgs = result.messages.filter(m => m.source === 'server');
    expect(serverMsgs.length).toBe(2);
    expect(serverMsgs[0].payload).toBe('hello');
    expect(serverMsgs[1].payload).toBe('world');
  });

  it('adds info message on connect', async () => {
    const ws = makeFakeWs();
    const adapters: RealtimeAdapters = { createWebSocket: () => ws };
    setImmediate(() => ws._emit('open'));

    const result = await runRealtimeCapture(
      { type: 'websocket', url: 'ws://localhost:9999', config: {} },
      { captureTimeout: 0.05 },
      adapters,
    );

    expect(result.messages.some(m => m.source === 'info' && m.payload === 'connected')).toBe(true);
  });

  it('sends sendMessages after connect', async () => {
    const ws = makeFakeWs();
    const adapters: RealtimeAdapters = { createWebSocket: () => ws };
    setImmediate(() => ws._emit('open'));

    await runRealtimeCapture(
      {
        type: 'websocket',
        url: 'ws://localhost:9999',
        config: {},
        sendMessages: [{ message: 'ping' }, { message: 'pong' }],
      },
      { captureTimeout: 0.1 },
      adapters,
    );

    expect(ws.send).toHaveBeenCalledWith('ping');
    expect(ws.send).toHaveBeenCalledWith('pong');
    const clientMsgs = result_of_send_msgs(ws);
    expect(clientMsgs).toContain('ping');
  });

  it('returns isError: true on connection error, does not throw', async () => {
    const ws = makeFakeWs();
    const adapters: RealtimeAdapters = { createWebSocket: () => ws };
    setImmediate(() => ws._emit('error', new Error('ECONNREFUSED')));

    const result = await runRealtimeCapture(
      { type: 'websocket', url: 'ws://localhost:9999', config: {} },
      { captureTimeout: 5 },
      adapters,
    );

    expect(result.isError).toBe(true);
    expect(result.errorMessage).toContain('ECONNREFUSED');
  });

  // Regression: the capture timeout used to be armed only inside the 'open'
  // handler, so a socket that never connects (unreachable host, stalled
  // upgrade) never resolved and hung the whole run_realtime call.
  it('resolves within the capture timeout even if the socket never opens', async () => {
    const ws = makeFakeWs(); // never emits 'open', 'error', or 'close'
    const adapters: RealtimeAdapters = { createWebSocket: () => ws };

    const start = Date.now();
    const result = await runRealtimeCapture(
      { type: 'websocket', url: 'ws://10.255.255.1:9999', config: {} },
      { captureTimeout: 0.2 },
      adapters,
    );
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000); // did not hang
    expect(result.messages.some(m => m.source === 'server')).toBe(false);
    // The connection never established - surfaced as an error, not a silent empty success.
    expect(result.isError).toBe(true);
    expect(ws.close).toHaveBeenCalled();
  });

  it('caps messages at 500 and sets truncated: true', async () => {
    const ws = makeFakeWs();
    const adapters: RealtimeAdapters = { createWebSocket: () => ws };

    setImmediate(() => {
      ws._emit('open');
      for (let i = 0; i < 600; i++) {
        ws._emit('message', Buffer.from(`msg-${i}`));
      }
    });

    const result = await runRealtimeCapture(
      { type: 'websocket', url: 'ws://localhost:9999', config: {} },
      { captureTimeout: 0.1 },
      adapters,
    );

    expect(result.truncated).toBe(true);
    expect(result.messages.length).toBeLessThanOrEqual(500);
  });

  it('records sent messages as client source', async () => {
    const ws = makeFakeWs();
    const adapters: RealtimeAdapters = { createWebSocket: () => ws };
    setImmediate(() => ws._emit('open'));

    const result = await runRealtimeCapture(
      {
        type: 'websocket',
        url: 'ws://localhost:9999',
        config: {},
        sendMessages: [{ message: 'hello-out' }],
      },
      { captureTimeout: 0.1 },
      adapters,
    );

    const clientMsgs = result.messages.filter(m => m.source === 'client');
    expect(clientMsgs.length).toBeGreaterThanOrEqual(1);
    expect(clientMsgs[0].payload).toBe('hello-out');
  });
});

// Tiny helper used in the sendMessages test
function result_of_send_msgs(ws: ReturnType<typeof makeFakeWs>): string[] {
  return ws.send.mock.calls.map((c: any[]) => c[0]);
}

// ---------------------------------------------------------------------------
// SSE tests
// ---------------------------------------------------------------------------

describe('runRealtimeCapture - SSE', () => {
  it('captures SSE messages', async () => {
    const es = makeFakeEs();
    const adapters: RealtimeAdapters = { createEventSource: () => es };

    setImmediate(() => {
      es._emitOpen();
      es._emitEvent('message', 'sse-data');
    });

    const result = await runRealtimeCapture(
      { type: 'sse', url: 'http://localhost:9999/events', config: {} },
      { captureTimeout: 0.1 },
      adapters,
    );

    expect(result.isError).toBeFalsy();
    const serverMsgs = result.messages.filter(m => m.source === 'server');
    expect(serverMsgs.length).toBeGreaterThanOrEqual(1);
    expect(serverMsgs[0].payload).toBe('sse-data');
  });

  it('returns isError: true on SSE error', async () => {
    const es = makeFakeEs();
    const adapters: RealtimeAdapters = { createEventSource: () => es };
    setImmediate(() => es._emitError({ message: 'SSE connection failed' }));

    const result = await runRealtimeCapture(
      { type: 'sse', url: 'http://localhost:9999/events', config: {} },
      { captureTimeout: 5 },
      adapters,
    );

    expect(result.isError).toBe(true);
    expect(result.errorMessage).toBeTruthy();
  });

  // Bug fix: onerror fired after a successful connect (server closes the stream)
  // must NOT produce isError:true - it is a normal graceful stream end.
  it('does not set isError when server closes connection after successful connect', async () => {
    const es = makeFakeEs();
    const adapters: RealtimeAdapters = { createEventSource: () => es };

    setImmediate(() => {
      es._emitOpen();
      es._emitEvent('message', 'event-1');
      es._emitEvent('message', 'event-2');
      es._emitError({}); // server closed the connection (EventSource fires onerror on EOF)
    });

    const result = await runRealtimeCapture(
      { type: 'sse', url: 'http://localhost:9999/events', config: {} },
      { captureTimeout: 5 },
      adapters,
    );

    expect(result.isError).toBeFalsy();
    const serverMsgs = result.messages.filter(m => m.source === 'server');
    expect(serverMsgs).toHaveLength(2);
    expect(serverMsgs[0].payload).toBe('event-1');
    expect(serverMsgs[1].payload).toBe('event-2');
  });

  // Bug fix: EsLike interface uses W3C EventSource API (onopen/onerror properties +
  // addEventListener) not Node.js EventEmitter .on() - verify executor wires correctly.
  it('wires executor via onopen/addEventListener/onerror (W3C API not EventEmitter)', async () => {
    const es = makeFakeEs();
    const addEventListenerSpy = vi.spyOn(es, 'addEventListener');
    const adapters: RealtimeAdapters = { createEventSource: () => es };

    // Fire open synchronously after a microtask so the executor has set up handlers
    setImmediate(() => es._emitOpen());

    await runRealtimeCapture(
      { type: 'sse', url: 'http://localhost:9999/events', config: {} },
      { captureTimeout: 0.05 },
      adapters,
    );

    // onopen and onerror must be set as properties (not via .on())
    expect(typeof es.onopen).toBe('function');
    expect(typeof es.onerror).toBe('function');
    // addEventListener must be called for the event type (not .on())
    expect(addEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('respects custom eventType from config', async () => {
    const es = makeFakeEs();
    const adapters: RealtimeAdapters = { createEventSource: () => es };

    setImmediate(() => {
      es._emitOpen();
      es._emitEvent('update', 'custom-event-data');
    });

    const result = await runRealtimeCapture(
      { type: 'sse', url: 'http://localhost:9999/events', config: { eventType: 'update' } },
      { captureTimeout: 0.1 },
      adapters,
    );

    const serverMsgs = result.messages.filter(m => m.source === 'server');
    expect(serverMsgs.length).toBeGreaterThanOrEqual(1);
    expect(serverMsgs[0].event).toBe('update');
  });
});

// ---------------------------------------------------------------------------
// Socket.IO tests
// ---------------------------------------------------------------------------

describe('runRealtimeCapture - Socket.IO', () => {
  it('captures events via onAny', async () => {
    const s = makeFakeSio();
    const adapters: RealtimeAdapters = { createSocketIO: () => s };

    setImmediate(() => {
      s._emit('connect');
      s._fireAny('chat', 'hello from server');
    });

    const result = await runRealtimeCapture(
      { type: 'socketio', url: 'http://localhost:9999', config: {} },
      { captureTimeout: 0.1 },
      adapters,
    );

    expect(result.isError).toBeFalsy();
    const serverMsgs = result.messages.filter(m => m.source === 'server');
    expect(serverMsgs.length).toBeGreaterThanOrEqual(1);
    expect(serverMsgs[0].event).toBe('chat');
    expect(serverMsgs[0].payload).toBe('hello from server');
  });

  it('returns isError: true on connect_error', async () => {
    const s = makeFakeSio();
    const adapters: RealtimeAdapters = { createSocketIO: () => s };
    setImmediate(() => s._emit('connect_error', new Error('Socket refused')));

    const result = await runRealtimeCapture(
      { type: 'socketio', url: 'http://localhost:9999', config: {} },
      { captureTimeout: 5 },
      adapters,
    );

    expect(result.isError).toBe(true);
    expect(result.errorMessage).toContain('Socket refused');
  });

  it('emits sendMessages after connect', async () => {
    const s = makeFakeSio();
    const adapters: RealtimeAdapters = { createSocketIO: () => s };
    setImmediate(() => s._emit('connect'));

    await runRealtimeCapture(
      {
        type: 'socketio',
        url: 'http://localhost:9999',
        config: {},
        sendMessages: [{ message: 'join-room', eventName: 'join' }],
      },
      { captureTimeout: 0.1 },
      adapters,
    );

    expect(s.emit).toHaveBeenCalledWith('join', 'join-room');
  });
});

// ---------------------------------------------------------------------------
// MQTT tests
// ---------------------------------------------------------------------------

describe('runRealtimeCapture - MQTT', () => {
  it('subscribes to configured topics and captures messages', async () => {
    const client = makeFakeMqtt();
    const adapters: RealtimeAdapters = { createMqttClient: () => client };

    setImmediate(() => {
      client._emit('connect');
      client._emit('message', 'sensors/temp', Buffer.from('42.5'), {});
    });

    const result = await runRealtimeCapture(
      {
        type: 'mqtt',
        url: 'mqtt://localhost:1883',
        config: { mqttTopics: [{ name: 'sensors/temp', qos: 0 }] },
      },
      { captureTimeout: 0.1 },
      adapters,
    );

    expect(result.isError).toBeFalsy();
    const serverMsgs = result.messages.filter(m => m.source === 'server');
    expect(serverMsgs.length).toBeGreaterThanOrEqual(1);
    expect(serverMsgs[0].topic).toBe('sensors/temp');
    expect(serverMsgs[0].payload).toBe('42.5');
    expect(client.subscribe).toHaveBeenCalledWith('sensors/temp', { qos: 0 }, expect.any(Function));
  });

  it('publishes sendMessages after connect', async () => {
    const client = makeFakeMqtt();
    const adapters: RealtimeAdapters = { createMqttClient: () => client };
    setImmediate(() => client._emit('connect'));

    await runRealtimeCapture(
      {
        type: 'mqtt',
        url: 'mqtt://localhost:1883',
        config: {},
        sendMessages: [{ message: 'ON', topic: 'lights/kitchen', retain: true }],
      },
      { captureTimeout: 0.1 },
      adapters,
    );

    expect(client.publish).toHaveBeenCalledWith('lights/kitchen', 'ON', { retain: true, qos: 0 }, expect.any(Function));
  });

  it('returns isError: true on MQTT error', async () => {
    const client = makeFakeMqtt();
    const adapters: RealtimeAdapters = { createMqttClient: () => client };
    setImmediate(() => client._emit('error', new Error('MQTT refused')));

    const result = await runRealtimeCapture(
      { type: 'mqtt', url: 'mqtt://localhost:1883', config: {} },
      { captureTimeout: 5 },
      adapters,
    );

    expect(result.isError).toBe(true);
    expect(result.errorMessage).toContain('MQTT refused');
  });
});

// ---------------------------------------------------------------------------
// Unknown type guard
// ---------------------------------------------------------------------------

describe('runRealtimeCapture - unknown type', () => {
  it('returns isError for unknown type', async () => {
    const result = await runRealtimeCapture(
      { type: 'unknown' as any, url: 'http://x', config: {} },
      { captureTimeout: 1 },
    );
    expect(result.isError).toBe(true);
    expect(result.errorMessage).toContain('Unknown type');
  });
});

// ---------------------------------------------------------------------------
// AWS SigV4 URL signing for WebSocket (T-214)
// ---------------------------------------------------------------------------

import { signRealtimeUrlForAws } from './realtime-executor.js';

describe('signRealtimeUrlForAws', () => {
  it('appends AWS SigV4 query params to a ws:// URL', () => {
    const signed = signRealtimeUrlForAws(
      'wss://xyz.appsync-realtime-api.us-east-1.amazonaws.com/graphql/realtime',
      { accessKey: 'AKIDEXAMPLE', secretKey: 'wJalrXUtnFEMI', region: 'us-east-1', service: 'appsync' },
    );
    expect(signed).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    expect(signed).toContain('X-Amz-Credential=AKIDEXAMPLE');
    expect(signed).toContain('X-Amz-Signature=');
    expect(signed).toContain('X-Amz-Date=');
    // The base URL must be preserved
    expect(signed).toContain('xyz.appsync-realtime-api.us-east-1.amazonaws.com');
  });

  it('includes X-Amz-Security-Token in query params when sessionToken is provided', () => {
    const signed = signRealtimeUrlForAws(
      'wss://example.iot.us-east-1.amazonaws.com/mqtt',
      { accessKey: 'AKID', secretKey: 'secret', region: 'us-east-1', service: 'iotdevicegateway', sessionToken: 'TOK' },
    );
    expect(signed).toContain('X-Amz-Security-Token=TOK');
  });

  it('respects a custom region and service in the credential scope', () => {
    const signed = signRealtimeUrlForAws(
      'wss://api.execute-api.ap-southeast-2.amazonaws.com/prod',
      { accessKey: 'AKID', secretKey: 'secret', region: 'ap-southeast-2', service: 'execute-api' },
    );
    expect(signed).toContain('ap-southeast-2%2Fexecute-api%2Faws4_request');
  });

  it('runRealtimeCapture passes the signed URL to createWebSocket when awsv4 auth is provided', async () => {
    const ws = makeFakeWs();
    let capturedUrl = '';
    const adapters: RealtimeAdapters = {
      createWebSocket: (url) => { capturedUrl = url; return ws; },
    };
    setImmediate(() => {
      ws._emit('open');
    });

    await runRealtimeCapture(
      {
        type: 'websocket',
        url: 'wss://xyz.execute-api.us-east-1.amazonaws.com/prod',
        config: {},
        awsAuth: { accessKey: 'AKID', secretKey: 'secret', region: 'us-east-1', service: 'execute-api' },
      },
      { captureTimeout: 1 },
      adapters,
    );

    expect(capturedUrl).toContain('X-Amz-Signature=');
    expect(capturedUrl).toContain('AKID');
  });
});
