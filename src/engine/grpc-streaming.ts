import * as grpcLoader from '@grpc/proto-loader';
import * as grpcJs from '@grpc/grpc-js';
import * as path from 'path';

// ---------------------------------------------------------------------------
// grpc-streaming.ts  (T-168)
//
// Streaming gRPC execution engine.
// Supports server streaming, client streaming, and bidirectional streaming.
//
// All streaming functions return a plain JSON-serialisable result so they
// can be returned directly from MCP tool handlers.
// ---------------------------------------------------------------------------

export interface StreamMessage {
  data: unknown;
  timestamp: string;
  direction: 'received' | 'sent';
}

export interface GrpcStreamResult {
  messages: StreamMessage[];
  truncated: boolean;
  isError?: boolean;
  errorMessage?: string;
}

export interface GrpcClientStreamResult {
  response: unknown;
  latency: number;
  isError?: boolean;
  errorMessage?: string;
}

export interface GrpcStreamRequest {
  serverUrl: string;
  protoFile: string;
  service: string;
  method: string;
  /** For server streaming - single outbound message */
  message?: Record<string, unknown>;
  /** For client/bidi streaming - array of messages */
  messages?: Record<string, unknown>[];
  metadata?: Record<string, string>;
  insecure?: boolean;
  /** Max seconds to buffer (default: 5) */
  streamTimeout?: number;
}

// ---------------------------------------------------------------------------
// Shared helper: load proto and build stub
// ---------------------------------------------------------------------------

async function loadStub(
  protoFile: string,
  service: string,
  protosDir: string,
): Promise<{ stub: any; error?: string }> {
  const protoPath = path.join(protosDir, protoFile);

  let packageDef: grpcLoader.PackageDefinition;
  try {
    packageDef = await grpcLoader.load(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [protosDir],
    });
  } catch (err: any) {
    return { stub: null, error: `Failed to load proto '${protoFile}': ${err?.message ?? String(err)}` };
  }

  const pkgObject = grpcJs.loadPackageDefinition(packageDef) as any;
  const parts = service.split('.');
  let ServiceCtor: any = pkgObject;
  for (const p of parts) ServiceCtor = ServiceCtor?.[p];

  if (typeof ServiceCtor !== 'function') {
    return { stub: null, error: `Service '${service}' not found in proto package` };
  }

  const creds = grpcJs.credentials.createInsecure();
  return { stub: null, error: undefined, ...{ stub: null } };
  // We return the constructor so callers can instantiate with a URL
  return { stub: ServiceCtor, error: undefined };
}

function buildMeta(metadata?: Record<string, string>): InstanceType<typeof grpcJs.Metadata> {
  const meta = new grpcJs.Metadata();
  if (metadata) {
    for (const [k, v] of Object.entries(metadata)) meta.add(k, v);
  }
  return meta;
}

async function resolveStub(
  req: GrpcStreamRequest,
  protosDir: string,
): Promise<{ stub: any; error?: string }> {
  const protoPath = path.join(protosDir, req.protoFile);

  let packageDef: grpcLoader.PackageDefinition;
  try {
    packageDef = await grpcLoader.load(protoPath, {
      keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
      includeDirs: [protosDir],
    });
  } catch (err: any) {
    return { stub: null, error: `Failed to load proto: ${err?.message ?? String(err)}` };
  }

  const pkgObject = grpcJs.loadPackageDefinition(packageDef) as any;
  const parts = req.service.split('.');
  let ServiceCtor: any = pkgObject;
  for (const p of parts) ServiceCtor = ServiceCtor?.[p];

  if (typeof ServiceCtor !== 'function') {
    return { stub: null, error: `Service '${req.service}' not found` };
  }

  const creds = req.insecure !== false
    ? grpcJs.credentials.createInsecure()
    : grpcJs.credentials.createSsl();

  const stub = new ServiceCtor(req.serverUrl, creds);
  return { stub };
}

// ---------------------------------------------------------------------------
// Server streaming
// ---------------------------------------------------------------------------

export async function runGrpcServerStream(
  req: GrpcStreamRequest,
  protosDir: string,
): Promise<GrpcStreamResult> {
  const { stub, error } = await resolveStub(req, protosDir);
  if (error) return { messages: [], truncated: false, isError: true, errorMessage: error };

  if (typeof stub[req.method] !== 'function') {
    return { messages: [], truncated: false, isError: true, errorMessage: `Method '${req.method}' not found` };
  }

  const timeoutMs = (req.streamTimeout ?? 5) * 1000;
  const meta = buildMeta(req.metadata);

  return new Promise(resolve => {
    const messages: StreamMessage[] = [];
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (truncated: boolean, isError?: boolean, errorMessage?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ messages, truncated, isError, errorMessage });
    };

    timer = setTimeout(() => finish(true), timeoutMs);

    const call = stub[req.method](req.message ?? {}, meta);

    call.on('data', (data: any) => {
      messages.push({ data, timestamp: new Date().toISOString(), direction: 'received' });
    });

    call.on('error', (err: any) => {
      finish(false, true, err?.details ?? err?.message ?? String(err));
    });

    call.on('end', () => finish(false));
    call.on('status', () => { /* status before end - ignore */ });
  });
}

// ---------------------------------------------------------------------------
// Client streaming
// ---------------------------------------------------------------------------

export async function runGrpcClientStream(
  req: GrpcStreamRequest,
  protosDir: string,
): Promise<GrpcClientStreamResult> {
  const { stub, error } = await resolveStub(req, protosDir);
  if (error) return { response: null, latency: 0, isError: true, errorMessage: error };

  if (typeof stub[req.method] !== 'function') {
    return { response: null, latency: 0, isError: true, errorMessage: `Method '${req.method}' not found` };
  }

  const meta = buildMeta(req.metadata);
  const start = Date.now();

  return new Promise(resolve => {
    let settled = false;

    const finish = (result: GrpcClientStreamResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const call = stub[req.method](meta);

    call.on('data', (response: any) => {
      finish({ response, latency: Date.now() - start });
    });

    call.on('error', (err: any) => {
      finish({ response: null, latency: Date.now() - start, isError: true, errorMessage: err?.details ?? err?.message ?? String(err) });
    });

    call.on('end', () => {
      if (!settled) finish({ response: null, latency: Date.now() - start });
    });

    // Send all messages
    for (const msg of req.messages ?? []) {
      call.write(msg);
    }
    call.end();
  });
}

// ---------------------------------------------------------------------------
// Bidirectional streaming
// ---------------------------------------------------------------------------

export async function runGrpcBidiStream(
  req: GrpcStreamRequest,
  protosDir: string,
): Promise<GrpcStreamResult> {
  const { stub, error } = await resolveStub(req, protosDir);
  if (error) return { messages: [], truncated: false, isError: true, errorMessage: error };

  if (typeof stub[req.method] !== 'function') {
    return { messages: [], truncated: false, isError: true, errorMessage: `Method '${req.method}' not found` };
  }

  const timeoutMs = (req.streamTimeout ?? 5) * 1000;
  const meta = buildMeta(req.metadata);

  return new Promise(resolve => {
    const messages: StreamMessage[] = [];
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (truncated: boolean, isError?: boolean, errorMessage?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ messages, truncated, isError, errorMessage });
    };

    timer = setTimeout(() => finish(true), timeoutMs);

    const call = stub[req.method](meta);

    call.on('data', (data: any) => {
      messages.push({ data, timestamp: new Date().toISOString(), direction: 'received' });
    });

    call.on('error', (err: any) => {
      finish(false, true, err?.details ?? err?.message ?? String(err));
    });

    call.on('end', () => finish(false));
    call.on('status', () => { /* ignore intermediate status */ });

    // Send all outbound messages
    for (const msg of req.messages ?? []) {
      messages.push({ data: msg, timestamp: new Date().toISOString(), direction: 'sent' });
      call.write(msg);
    }
    call.end();
  });
}
