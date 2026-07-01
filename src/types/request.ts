import { AuthProfile } from './auth.js';
import { Assertion } from './assertion.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface GraphQLConfig {
  query?: string;
  queryFile?: string;
  variables?: Record<string, unknown>;
  operationName?: string;
  /** For graphql-subscription type: max seconds to buffer messages (default 5) */
  streamTimeout?: number;
}

/**
 * gRPC-specific configuration block on a request.
 * `method` on the outer RequestConfig is unused for gRPC requests.
 * `url` on the outer RequestConfig holds the server address (e.g. "localhost:50051").
 * `headers` on the outer RequestConfig map directly to gRPC Metadata entries.
 */
export interface GrpcConfig {
  /** Path to the .proto file relative to .reqly/protos/ */
  protoFile: string;
  /** Fully-qualified service name, e.g. "helloworld.Greeter" */
  service: string;
  /** Method name on the service, e.g. "SayHello" */
  method: string;
  /** JSON message body to send */
  message?: Record<string, unknown>;
  /** Use insecure (plaintext) channel. Defaults to true. */
  insecure?: boolean;
  /** Streaming mode for T-168. Unset = unary. */
  streaming?: 'server' | 'client' | 'bidirectional';
  /** For streaming modes: max seconds to buffer (default 5) */
  streamTimeout?: number;
  /** For client/bidirectional streaming: array of messages to send */
  messages?: Record<string, unknown>[];
}

// Inline auth carried directly on a request or a collection (no separate
// AuthProfile record). `type: 'none'` on a request explicitly opts out of any
// inherited (collection-level) auth.
export interface InlineAuth {
  type: string;
  credentials?: Record<string, string>;
}

// A single field in a multipart/form-data body. `text` parts carry their
// value inline; `file` parts carry only a path (relative to the project
// root, resolved via CollectionManager.getBaseDir()) - file contents are
// never stored in the collection YAML.
export interface MultipartPart {
  name: string;
  type: 'text' | 'file';
  value?: string;
  filePath?: string;
  contentType?: string;
}

export interface MultipartBody {
  type: 'multipart';
  parts: MultipartPart[];
}

export type RequestBody = string | Record<string, unknown> | MultipartBody;

export interface RequestConfig {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: RequestBody;
  params?: Record<string, string>;
  disabledParams?: { key: string; value: string }[];
  disabledHeaders?: { key: string; value: string }[];
  authProfileId?: string;
  auth?: InlineAuth;
  environmentId?: string;
  assertions?: Assertion[];
  type?: 'rest' | 'graphql' | 'graphql-subscription' | 'grpc';
  graphql?: GraphQLConfig;
  grpc?: GrpcConfig;
  preScript?: string;
  postScript?: string;
  preScriptFile?: string;
  postScriptFile?: string;
  // Explicit mock-server route path. When set, overrides the path inferred
  // from `url` by the mock server (T-101). e.g. '/v1/charges', '/users/:id'.
  mockPath?: string;
  // Explicit OpenAPI operationId for contract validation (T-105). When set,
  // the validator matches this request to the spec operation by id instead of
  // inferring the path from `url`.
  specOperationId?: string;
}
