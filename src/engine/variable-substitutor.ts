import { RequestConfig } from '../types/index.js';
import { ResponseStore } from './response-store.js';

type VarLayer = Record<string, string>;

/**
 * Resolve `{{...}}` placeholders against a layered scope chain.
 *
 * Layers are tried in priority order - the FIRST layer that defines a plain
 * variable name wins (so `[collectionVars, envVars]` lets collection vars
 * override env vars on collision). Dotted keys (`{{login.response.token}}`)
 * are resolved separately via the ResponseStore for request chaining, and
 * coexist with plain variable names without conflict.
 *
 * The layered design is deliberate: a future flow runner can prepend a
 * flow-local scope (`[flowLocalScope, collectionVars, envVars]`) without
 * touching this resolver's internals.
 */
export function resolveVariables(
  template: string,
  layers: VarLayer[] = [],
  responseStore?: ResponseStore
): string {
  if (!template) return template;

  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const trimmed = key.trim();

    // 1. Plain variable name: first matching layer wins.
    for (const layer of layers) {
      if (layer && layer[trimmed] !== undefined) {
        return layer[trimmed];
      }
    }

    // 2. Dotted response-chaining (e.g. {{login.response.token}}).
    if (responseStore && trimmed.includes('.response.')) {
      const val = responseStore.getValue(trimmed);
      if (val !== undefined) {
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      }
    }

    // 3. Unresolved, keep original.
    return match;
  });
}

function toLayers(variables: VarLayer | VarLayer[]): VarLayer[] {
  return Array.isArray(variables) ? variables : [variables];
}

export function substitute(
  template: string,
  variables: VarLayer | VarLayer[] = {},
  responseStore?: ResponseStore
): string {
  return resolveVariables(template, toLayers(variables), responseStore);
}

export function substituteConfig<T extends RequestConfig>(
  config: T,
  variables: VarLayer | VarLayer[] = {},
  responseStore?: ResponseStore
): T {
  const layers = toLayers(variables);
  const newConfig: T = { ...config };

  if (config.url) {
    newConfig.url = resolveVariables(config.url, layers, responseStore);
  }

  if (config.headers) {
    newConfig.headers = {};
    for (const [k, v] of Object.entries(config.headers)) {
      newConfig.headers[k] = resolveVariables(v, layers, responseStore);
    }
  }

  if (config.params) {
    newConfig.params = {};
    for (const [k, v] of Object.entries(config.params)) {
      newConfig.params[k] = resolveVariables(v, layers, responseStore);
    }
  }

  if (typeof config.body === 'string') {
    newConfig.body = resolveVariables(config.body, layers, responseStore);
  }

  return newConfig;
}
