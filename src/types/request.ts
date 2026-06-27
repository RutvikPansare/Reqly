import { AuthProfile } from './auth.js';
import { Assertion } from './assertion.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface GraphQLConfig {
  query: string;
  variables?: Record<string, unknown>;
}

// Inline auth carried directly on a request or a collection (no separate
// AuthProfile record). `type: 'none'` on a request explicitly opts out of any
// inherited (collection-level) auth.
export interface InlineAuth {
  type: string;
  credentials?: Record<string, string>;
}

export interface RequestConfig {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  params?: Record<string, string>;
  authProfileId?: string;
  auth?: InlineAuth;
  environmentId?: string;
  assertions?: Assertion[];
  type?: 'rest' | 'graphql';
  graphql?: GraphQLConfig;
  preScript?: string;
  postScript?: string;
  // Explicit mock-server route path. When set, overrides the path inferred
  // from `url` by the mock server (T-101). e.g. '/v1/charges', '/users/:id'.
  mockPath?: string;
  // Explicit OpenAPI operationId for contract validation (T-105). When set,
  // the validator matches this request to the spec operation by id instead of
  // inferring the path from `url`.
  specOperationId?: string;
}
