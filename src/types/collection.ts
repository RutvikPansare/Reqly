import { RequestConfig } from './request.js';

export interface ExampleResponse {
  id: string;
  name: string;
  status: number;
  headers: Record<string, string>;
  body: string | Record<string, unknown> | null;
  latency: number;
  savedAt: string;
}

export interface CollectionRequest extends RequestConfig {
  id: string;
  name: string;
  examples?: ExampleResponse[];
}

// Collection-level auth applied to every request in the collection unless the
// request overrides it. Either references a saved AuthProfile by id, or carries
// inline credentials. `type: 'none'` means no collection auth.
export interface CollectionAuth {
  type: string;
  profileId?: string;
  credentials?: Record<string, string>;
}

// OpenAPI/Swagger spec configured on a collection, used for contract
// validation. At most one of specPath (local file) or specUrl (remote) is set.
export interface CollectionSpec {
  specPath?: string;
  specUrl?: string;
}

// A single contract-validation finding against an OpenAPI spec.
export interface ContractViolation {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface Collection {
  name: string;
  description?: string;
  variables?: Record<string, string>;
  auth?: CollectionAuth;
  spec?: CollectionSpec;
  requests: CollectionRequest[];
}

export interface CollectionMeta {
  description?: string;
  variables?: Record<string, string>;
  auth?: CollectionAuth;
  spec?: CollectionSpec;
}
