import { AuthProfile } from './auth.js';
import { Assertion } from './assertion.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface GraphQLConfig {
  query: string;
  variables?: Record<string, unknown>;
}

export interface RequestConfig {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  params?: Record<string, string>;
  authProfileId?: string;
  environmentId?: string;
  assertions?: Assertion[];
  type?: 'rest' | 'graphql';
  graphql?: GraphQLConfig;
}
