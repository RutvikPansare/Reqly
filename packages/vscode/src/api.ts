/**
 * Thin client over the Reqly local server REST API (localhost:4242).
 * Deliberately free of any `vscode` imports so it can be unit-tested
 * with plain vitest and reused by the CodeLens provider.
 */

export interface ReqlyRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  type?: string;
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
  [key: string]: unknown;
}

export interface ReqlyCollection {
  name: string;
  projectDir?: string;
  description?: string;
  requests: ReqlyRequest[];
}

export interface ReqlyEnvironment {
  name: string;
  variables: Record<string, string>;
}

export interface EnvironmentsResponse {
  environments: ReqlyEnvironment[];
  active?: string;
}

export interface RunResponse {
  status: number;
  statusText?: string;
  latency: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface RunResult {
  response: RunResponse;
  assertions?: { name?: string; passed: boolean; expected?: unknown; actual?: unknown }[];
  testResults?: { name: string; passed: boolean; error?: string }[];
  [key: string]: unknown;
}

export interface CollectionRunResult {
  results?: unknown[];
  summary?: { total: number; passed: number; failed: number };
  [key: string]: unknown;
}

export interface ProjectInfo {
  path: string;
  name: string;
}

/** Thrown when the Reqly server is not reachable at the configured URL. */
export class ServerNotRunningError extends Error {
  constructor(baseUrl: string) {
    super(`Reqly server is not running at ${baseUrl}. Start it with "reqly start" or open the desktop app.`);
    this.name = 'ServerNotRunningError';
  }
}

export class ReqlyApi {
  constructor(
    private readonly baseUrl: string = 'http://localhost:4242',
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, init);
    } catch {
      throw new ServerNotRunningError(this.baseUrl);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = (data as { error?: string }).error ?? `Reqly server returned HTTP ${res.status}`;
      throw new Error(message);
    }
    return data as T;
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async isRunning(): Promise<boolean> {
    try {
      await this.request('/api/project');
      return true;
    } catch {
      return false;
    }
  }

  getProject(): Promise<ProjectInfo> {
    return this.request<ProjectInfo>('/api/project');
  }

  getCollections(): Promise<ReqlyCollection[]> {
    return this.request<ReqlyCollection[]>('/api/collections');
  }

  getEnvironments(): Promise<EnvironmentsResponse> {
    return this.request<EnvironmentsResponse>('/api/environments');
  }

  setActiveEnvironment(name: string): Promise<{ success: boolean }> {
    return this.post('/api/environments/active', { name });
  }

  /**
   * Fire a saved request. The server resolves variables and collection auth
   * from `_collection`, so the raw saved config can be sent as-is.
   */
  runRequest(request: ReqlyRequest, collectionName: string, environmentName?: string): Promise<RunResult> {
    return this.post('/api/run/adhoc', {
      request: { ...request, _collection: collectionName },
      environmentName,
    });
  }

  runCollection(collectionName: string, environmentName?: string): Promise<CollectionRunResult> {
    return this.post('/api/run/collection', { collectionName, environmentName });
  }

  startProxy(port?: number, collectionName?: string): Promise<{ success: boolean }> {
    return this.post('/api/proxy/start', { port, collectionName });
  }

  createRequest(
    collectionName: string,
    request: { name: string; method: string; url: string } & Record<string, unknown>
  ): Promise<{ success: boolean }> {
    return this.post(`/api/collections/${encodeURIComponent(collectionName)}/requests`, request);
  }
}
