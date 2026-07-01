import * as grpcLoader from '@grpc/proto-loader';
import * as grpcJs from '@grpc/grpc-js';
import * as path from 'path';

// ---------------------------------------------------------------------------
// grpc-runner.ts  (T-164, T-165)
//
// Executes unary gRPC calls against a server. Proto files are resolved from
// a base directory (`.reqly/protos/` in the project) with full includeDirs
// support so cross-file imports (`import "google/protobuf/timestamp.proto"`)
// resolve correctly.
//
// Auth / metadata (T-165): callers pass a `metadata` object whose keys map
// directly to gRPC Metadata entries. The http-executor equivalent is `headers`.
// Reqly's auth injection layer (collection-auth + auth-manager) builds this
// map before calling runGrpcRequest, so auth profiles work identically to REST.
// ---------------------------------------------------------------------------

// gRPC status code -> human-readable name mapping (subset; includes all commonly seen codes).
const GRPC_STATUS_NAMES: Record<number, string> = {
  0:  'OK',
  1:  'CANCELLED',
  2:  'UNKNOWN',
  3:  'INVALID_ARGUMENT',
  4:  'DEADLINE_EXCEEDED',
  5:  'NOT_FOUND',
  6:  'ALREADY_EXISTS',
  7:  'PERMISSION_DENIED',
  8:  'RESOURCE_EXHAUSTED',
  9:  'FAILED_PRECONDITION',
  10: 'ABORTED',
  11: 'OUT_OF_RANGE',
  12: 'UNIMPLEMENTED',
  13: 'INTERNAL',
  14: 'UNAVAILABLE',
  15: 'DATA_LOSS',
  16: 'UNAUTHENTICATED',
};

function statusName(code: number): string {
  return GRPC_STATUS_NAMES[code] ?? `UNKNOWN_${code}`;
}

/** Options passed to runGrpcRequest by the MCP layer / collection runner. */
export interface GrpcRequest {
  /** gRPC server address, e.g. "localhost:50051" */
  serverUrl: string;
  /** Proto file path relative to protosDir, e.g. "helloworld.proto" */
  protoFile: string;
  /** Fully-qualified service name, e.g. "helloworld.Greeter" */
  service: string;
  /** Method name on the service, e.g. "SayHello" */
  method: string;
  /** JSON-serialisable message to send */
  message: Record<string, unknown>;
  /**
   * Additional metadata key/value pairs injected by the auth layer.
   * Keys are lowercase header names (e.g. "authorization", "x-api-key").
   */
  metadata?: Record<string, string>;
  /** Use insecure (plaintext) channel. Default: true for localhost, false otherwise. */
  insecure?: boolean;
  /** TLS root cert PEM path (optional, for TLS channels). */
  tlsCertPath?: string;
}

export interface GrpcResponse {
  /** Human-readable gRPC status name (e.g. "OK", "NOT_FOUND") */
  grpcStatus: string;
  /** Numeric gRPC status code */
  grpcStatusCode: number;
  /** Decoded response message, or null on error */
  body: Record<string, unknown> | null;
  /** Round-trip latency in milliseconds */
  latency: number;
  /** Present when grpcStatusCode != 0 */
  isError?: boolean;
  /** Present when grpcStatusCode != 0 */
  errorMessage?: string;
}

/**
 * Executes a unary gRPC call.
 *
 * @param req      - Request descriptor (service, method, message, metadata).
 * @param protosDir - Absolute path to the directory containing .proto files.
 *                   Passed as an includeDirs entry so cross-file imports resolve.
 */
export async function runGrpcRequest(
  req: GrpcRequest,
  protosDir: string,
): Promise<GrpcResponse> {
  const protoPath = path.join(protosDir, req.protoFile);

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
    return {
      grpcStatus: 'UNKNOWN',
      grpcStatusCode: 2,
      body: null,
      latency: 0,
      isError: true,
      errorMessage: `Failed to load proto file '${req.protoFile}': ${err?.message ?? String(err)}`,
    };
  }

  // Resolve the package object for the service.
  const pkgObject = grpcJs.loadPackageDefinition(packageDef) as any;

  // Navigate the service path (e.g. "helloworld.Greeter" -> pkgObject.helloworld.Greeter)
  const serviceParts = req.service.split('.');
  let serviceConstructor: any = pkgObject;
  for (const part of serviceParts) {
    serviceConstructor = serviceConstructor?.[part];
  }

  if (typeof serviceConstructor !== 'function') {
    return {
      grpcStatus: 'UNIMPLEMENTED',
      grpcStatusCode: 12,
      body: null,
      latency: 0,
      isError: true,
      errorMessage: `Service '${req.service}' not found in proto package definition`,
    };
  }

  // Build channel credentials
  const creds = (req.insecure !== false)
    ? grpcJs.credentials.createInsecure()
    : grpcJs.credentials.createSsl();

  const stub = new serviceConstructor(req.serverUrl, creds);

  if (typeof stub[req.method] !== 'function') {
    return {
      grpcStatus: 'UNIMPLEMENTED',
      grpcStatusCode: 12,
      body: null,
      latency: 0,
      isError: true,
      errorMessage: `Method '${req.method}' not found on service '${req.service}'`,
    };
  }

  // Build gRPC Metadata from the metadata map (T-165).
  const meta = new grpcJs.Metadata();
  if (req.metadata) {
    for (const [key, value] of Object.entries(req.metadata)) {
      meta.add(key, value);
    }
  }

  // Execute the call and measure latency.
  const start = Date.now();
  return new Promise<GrpcResponse>(resolve => {
    stub[req.method](req.message, meta, (err: any, response: any) => {
      const latency = Date.now() - start;

      if (err) {
        const code: number = err.code ?? 2;
        resolve({
          grpcStatus: statusName(code),
          grpcStatusCode: code,
          body: null,
          latency,
          isError: true,
          errorMessage: err.details ?? err.message ?? String(err),
        });
        return;
      }

      resolve({
        grpcStatus: 'OK',
        grpcStatusCode: 0,
        body: response,
        latency,
      });
    });
  });
}
