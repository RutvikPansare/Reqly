import { runGrpcRequest } from './grpc-runner.js';
import { runGrpcServerStream, runGrpcClientStream, runGrpcBidiStream, GrpcStreamRequest } from './grpc-streaming.js';

// ---------------------------------------------------------------------------
// grpc-adhoc.ts
// Thin dispatcher used by the /api/run/adhoc Express endpoint.
// Routes to the correct gRPC runner based on the streaming field.
// ---------------------------------------------------------------------------

export interface GrpcAdhocRequest {
  serverUrl: string;
  protoFile: string;
  service: string;
  method: string;
  message?: Record<string, unknown>;
  messages?: Record<string, unknown>[];
  metadata?: Record<string, string>;
  insecure?: boolean;
  streaming?: 'server' | 'client' | 'bidirectional';
  streamTimeout?: number;
}

export async function runGrpcAdhoc(req: GrpcAdhocRequest, protosDir: string): Promise<unknown> {
  if (!req.streaming) {
    return runGrpcRequest({
      serverUrl: req.serverUrl,
      protoFile: req.protoFile,
      service: req.service,
      method: req.method,
      message: req.message ?? {},
      metadata: req.metadata,
      insecure: req.insecure,
    }, protosDir);
  }

  const streamReq: GrpcStreamRequest = {
    serverUrl: req.serverUrl,
    protoFile: req.protoFile,
    service: req.service,
    method: req.method,
    message: req.message,
    messages: req.messages ?? [],
    metadata: req.metadata,
    insecure: req.insecure,
    streamTimeout: req.streamTimeout,
  };

  switch (req.streaming) {
    case 'server':      return runGrpcServerStream(streamReq, protosDir);
    case 'client':      return runGrpcClientStream(streamReq, protosDir);
    case 'bidirectional': return runGrpcBidiStream(streamReq, protosDir);
  }
}
