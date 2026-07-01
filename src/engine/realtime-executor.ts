import * as crypto from 'crypto';
import WebSocket from 'ws';
import { EventSource } from 'eventsource';
import { io as socketIo } from 'socket.io-client';
import mqtt from 'mqtt';
import type { RealtimeConfig } from '../types/request.js';

// ---------------------------------------------------------------------------
// realtime-executor.ts  (T-186)
//
// Buffered capture executor for WebSocket, SSE, Socket.IO, and MQTT.
// Used ONLY by MCP tools and the /api/run/realtime Express route.
// NOT used by UI panels - the browser connects directly.
//
// All functions return a plain JSON-serialisable result (never throws).
// ---------------------------------------------------------------------------

const RING_BUFFER_MAX = 500;

export interface RealtimeMessage {
  id: string;
  ts: number;
  source: 'client' | 'server' | 'info' | 'error';
  payload: string;
  topic?: string;
  event?: string;
}

export interface RealtimeCaptureResult {
  messages: RealtimeMessage[];
  truncated: boolean;
  isError?: boolean;
  errorMessage?: string;
}

export interface RealtimeSendMessage {
  message: string;
  eventName?: string;
  topic?: string;
  retain?: boolean;
}

export interface RealtimeCaptureRequest {
  type: 'websocket' | 'sse' | 'socketio' | 'mqtt';
  url: string;
  config: RealtimeConfig;
  sendMessages?: RealtimeSendMessage[];
}

// Dependency injection type - allows tests to swap out connection factories
export interface RealtimeAdapters {
  createWebSocket?: (url: string, protocols?: string[]) => WsLike;
  createEventSource?: (url: string) => EsLike;
  createSocketIO?: (url: string, opts: Record<string, any>) => SioLike;
  createMqttClient?: (url: string, opts: mqtt.IClientOptions) => MqttLike;
}

// Minimal interface contracts for each connection type
export interface WsLike {
  on(event: 'open', fn: () => void): void;
  on(event: 'message', fn: (data: any) => void): void;
  on(event: 'error', fn: (err: Error) => void): void;
  on(event: 'close', fn: () => void): void;
  send(data: string): void;
  close(): void;
}

export interface EsLike {
  addEventListener(event: string, fn: (...args: any[]) => void): void;
  onopen: ((evt: any) => void) | null;
  onerror: ((err: any) => void) | null;
  close(): void;
}

export interface SioLike {
  on(event: string, fn: (...args: any[]) => void): void;
  onAny(fn: (eventName: string, ...args: any[]) => void): void;
  emit(event: string, ...args: any[]): void;
  disconnect(): void;
}

export interface MqttLike {
  on(event: string, fn: (...args: any[]) => void): void;
  subscribe(topic: string, opts: { qos: 0 | 1 | 2 }, cb: (err: any) => void): void;
  publish(topic: string, message: string, opts: { retain: boolean; qos: 0 | 1 | 2 }, cb: (err: any) => void): void;
  end(force?: boolean): void;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeMsg(source: RealtimeMessage['source'], payload: string, extra?: Partial<RealtimeMessage>): RealtimeMessage {
  return { id: crypto.randomUUID(), ts: Date.now(), source, payload, ...extra };
}

function push(messages: RealtimeMessage[], msg: RealtimeMessage): boolean {
  if (messages.length >= RING_BUFFER_MAX) return false;
  messages.push(msg);
  return true;
}

function payloadString(data: any): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (typeof data === 'string') return data;
  try { return JSON.stringify(data); } catch { return String(data); }
}

// ---------------------------------------------------------------------------
// WebSocket capture
// ---------------------------------------------------------------------------

function captureWebSocket(
  req: RealtimeCaptureRequest,
  captureTimeoutMs: number,
  adapters: RealtimeAdapters,
): Promise<RealtimeCaptureResult> {
  return new Promise(resolve => {
    const messages: RealtimeMessage[] = [];
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (truncated: boolean, isError?: boolean, errorMessage?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve({ messages, truncated, isError, errorMessage });
    };

    const protocols = req.config.protocols ?? [];
    const createWs = adapters.createWebSocket ?? ((url, protos) => new WebSocket(url, protos) as unknown as WsLike);
    const ws = createWs(req.url, protocols.length > 0 ? protocols : undefined);

    ws.on('open', () => {
      push(messages, makeMsg('info', 'connected'));
      timer = setTimeout(() => finish(messages.length >= RING_BUFFER_MAX), captureTimeoutMs);

      for (const sm of req.sendMessages ?? []) {
        ws.send(sm.message);
        push(messages, makeMsg('client', sm.message));
      }
    });

    ws.on('message', (data: any) => {
      const payload = payloadString(data);
      if (!push(messages, makeMsg('server', payload))) {
        finish(true);
      }
    });

    ws.on('error', (err: Error) => {
      finish(false, true, err?.message ?? String(err));
    });

    ws.on('close', () => {
      if (!settled) finish(false);
    });
  });
}

// ---------------------------------------------------------------------------
// SSE capture
// ---------------------------------------------------------------------------

function captureSSE(
  req: RealtimeCaptureRequest,
  captureTimeoutMs: number,
  adapters: RealtimeAdapters,
): Promise<RealtimeCaptureResult> {
  return new Promise(resolve => {
    const messages: RealtimeMessage[] = [];
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (truncated: boolean, isError?: boolean, errorMessage?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { es.close(); } catch {}
      resolve({ messages, truncated, isError, errorMessage });
    };

    const createES = adapters.createEventSource ?? ((url) => new EventSource(url) as unknown as EsLike);
    const es = createES(req.url);
    const eventType = req.config.eventType ?? 'message';

    es.onopen = () => {
      push(messages, makeMsg('info', 'connected'));
      timer = setTimeout(() => finish(messages.length >= RING_BUFFER_MAX), captureTimeoutMs);
    };

    es.addEventListener(eventType, (evt: any) => {
      const payload = typeof evt?.data === 'string' ? evt.data : payloadString(evt?.data);
      if (!push(messages, makeMsg('server', payload, { event: eventType !== 'message' ? eventType : undefined }))) {
        finish(true);
      }
    });

    es.onerror = (err: any) => {
      // If we already connected and captured messages, a close/error is just stream end - not a user-facing error
      const connected = messages.some(m => m.source === 'info' && m.payload === 'connected');
      if (connected) {
        finish(false);
      } else {
        const msg = err?.message ?? err?.type ?? 'SSE error';
        finish(false, true, msg);
      }
    };
  });
}

// ---------------------------------------------------------------------------
// Socket.IO capture
// ---------------------------------------------------------------------------

function captureSocketIO(
  req: RealtimeCaptureRequest,
  captureTimeoutMs: number,
  adapters: RealtimeAdapters,
): Promise<RealtimeCaptureResult> {
  return new Promise(resolve => {
    const messages: RealtimeMessage[] = [];
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (truncated: boolean, isError?: boolean, errorMessage?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { socket.disconnect(); } catch {}
      resolve({ messages, truncated, isError, errorMessage });
    };

    const ioOpts: Record<string, any> = {};
    if (req.config.path) ioOpts.path = req.config.path;
    if (req.config.authType === 'bearer' && req.config.authToken) {
      ioOpts.auth = { token: req.config.authToken };
    }

    const createSio = adapters.createSocketIO ?? ((url, opts) => socketIo(url, opts) as unknown as SioLike);
    const socket = createSio(req.url, ioOpts);

    socket.on('connect', () => {
      push(messages, makeMsg('info', 'connected'));
      timer = setTimeout(() => finish(messages.length >= RING_BUFFER_MAX), captureTimeoutMs);

      for (const sm of req.sendMessages ?? []) {
        const evtName = sm.eventName ?? 'message';
        socket.emit(evtName, sm.message);
        push(messages, makeMsg('client', sm.message, { event: evtName }));
      }
    });

    socket.onAny((eventName: string, ...args: any[]) => {
      if (eventName === 'connect' || eventName === 'disconnect') return;
      const payload = args.length === 1 ? payloadString(args[0]) : payloadString(args);
      if (!push(messages, makeMsg('server', payload, { event: eventName }))) {
        finish(true);
      }
    });

    socket.on('connect_error', (err: Error) => {
      finish(false, true, err?.message ?? String(err));
    });

    socket.on('disconnect', () => {
      if (!settled) finish(false);
    });
  });
}

// ---------------------------------------------------------------------------
// MQTT capture
// ---------------------------------------------------------------------------

function captureMQTT(
  req: RealtimeCaptureRequest,
  captureTimeoutMs: number,
  adapters: RealtimeAdapters,
): Promise<RealtimeCaptureResult> {
  return new Promise(resolve => {
    const messages: RealtimeMessage[] = [];
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (truncated: boolean, isError?: boolean, errorMessage?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { client.end(true); } catch {}
      resolve({ messages, truncated, isError, errorMessage });
    };

    const cfg = req.config;
    const connectOpts: mqtt.IClientOptions = {};
    if (cfg.mqttClientId) connectOpts.clientId = cfg.mqttClientId;
    if (cfg.mqttUsername) connectOpts.username = cfg.mqttUsername;
    if (cfg.mqttPassword) connectOpts.password = cfg.mqttPassword;
    if (cfg.mqttKeepalive != null) connectOpts.keepalive = cfg.mqttKeepalive;
    if (cfg.mqttCleanSession != null) connectOpts.clean = cfg.mqttCleanSession;

    const createMqtt = adapters.createMqttClient ?? ((url, opts) => mqtt.connect(url, opts) as unknown as MqttLike);
    const client = createMqtt(req.url, connectOpts);

    client.on('connect', () => {
      push(messages, makeMsg('info', 'connected'));
      timer = setTimeout(() => finish(messages.length >= RING_BUFFER_MAX), captureTimeoutMs);

      const topics = cfg.mqttTopics ?? [];
      for (const t of topics) {
        client.subscribe(t.name, { qos: t.qos }, () => {});
      }

      for (const sm of req.sendMessages ?? []) {
        const topic = sm.topic ?? '';
        client.publish(topic, sm.message, { retain: sm.retain ?? false, qos: 0 }, () => {});
        push(messages, makeMsg('client', sm.message, { topic }));
      }
    });

    client.on('message', (topic: string, payload: Buffer) => {
      if (!push(messages, makeMsg('server', payload.toString('utf8'), { topic }))) {
        finish(true);
      }
    });

    client.on('error', (err: Error) => {
      finish(false, true, err?.message ?? String(err));
    });

    client.on('end', () => {
      if (!settled) finish(false);
    });
  });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function runRealtimeCapture(
  req: RealtimeCaptureRequest,
  opts: { captureTimeout: number },
  adapters: RealtimeAdapters = {},
): Promise<RealtimeCaptureResult> {
  const captureTimeoutMs = opts.captureTimeout * 1000;

  try {
    switch (req.type) {
      case 'websocket': return await captureWebSocket(req, captureTimeoutMs, adapters);
      case 'sse':       return await captureSSE(req, captureTimeoutMs, adapters);
      case 'socketio':  return await captureSocketIO(req, captureTimeoutMs, adapters);
      case 'mqtt':      return await captureMQTT(req, captureTimeoutMs, adapters);
      default:
        return { messages: [], truncated: false, isError: true, errorMessage: `Unknown type: ${(req as any).type}` };
    }
  } catch (err: any) {
    return { messages: [], truncated: false, isError: true, errorMessage: err?.message ?? String(err) };
  }
}
