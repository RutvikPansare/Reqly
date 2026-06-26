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

export interface Collection {
  name: string;
  description?: string;
  variables?: Record<string, string>;
  requests: CollectionRequest[];
}

export interface CollectionMeta {
  description?: string;
  variables?: Record<string, string>;
}
