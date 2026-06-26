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

export interface Collection {
  name: string;
  description?: string;
  variables?: Record<string, string>;
  auth?: CollectionAuth;
  requests: CollectionRequest[];
}

export interface CollectionMeta {
  description?: string;
  variables?: Record<string, string>;
  auth?: CollectionAuth;
}
