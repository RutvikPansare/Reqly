import { resolveConfig, captureInbound, ReqlyMiddlewareConfig } from './core.js';

export function reqlyNextMiddleware(config: ReqlyMiddlewareConfig = {}) {
  const resolved = resolveConfig(config);
  return function (request: any) {
    captureInbound(resolved, {
      method: request.method,
      url: request.nextUrl?.pathname || request.url,
      headers: Object.fromEntries(request.headers ?? []),
      body: undefined
    });
    return undefined;
  };
}
