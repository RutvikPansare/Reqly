export interface ReqlyMiddlewareConfig {
  endpoint?: string;
  collection?: string;
  ignoreRoutes?: string[];
}

export interface ResolvedConfig {
  endpoint: string;
  collection: string;
  ignoreRoutes: string[];
}

export function resolveConfig(config: ReqlyMiddlewareConfig = {}): ResolvedConfig {
  return {
    endpoint: config.endpoint || 'http://localhost:4242/capture',
    collection: config.collection || 'Captured',
    ignoreRoutes: config.ignoreRoutes || ['/_next', '/static', '/favicon']
  };
}

export function isIgnored(url: string, ignoreRoutes: string[]): boolean {
  return ignoreRoutes.some((prefix) => url.startsWith(prefix));
}

export function captureInbound(
  config: ResolvedConfig,
  payload: { method: string; url: string; headers: unknown; body: unknown }
): void {
  if (isIgnored(payload.url, config.ignoreRoutes)) {
    return;
  }

  fetch(`${config.endpoint}/inbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      collection: config.collection,
      timestamp: new Date().toISOString()
    })
  }).catch(() => {
    // Reqly might not be running locally - never let capture failures affect the app
  });
}
