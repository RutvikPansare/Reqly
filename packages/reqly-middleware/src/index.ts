import { resolveConfig, captureInbound, ReqlyMiddlewareConfig } from './core.js';

export function reqlyMiddleware(config: ReqlyMiddlewareConfig = {}) {
  const resolved = resolveConfig(config);
  return function (req: any, _res: any, next: () => void) {
    captureInbound(resolved, {
      method: req.method,
      url: req.originalUrl || req.url,
      headers: req.headers,
      body: req.body
    });
    next();
  };
}

export function reqlyMiddlewareHook(config: ReqlyMiddlewareConfig = {}) {
  const resolved = resolveConfig(config);
  return function (request: any, _reply: any, done: () => void) {
    captureInbound(resolved, {
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body
    });
    done();
  };
}

export type { ReqlyMiddlewareConfig };
