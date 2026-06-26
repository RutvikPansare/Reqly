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
}
