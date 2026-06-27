import { Ajv } from 'ajv';
import addFormatsModule from 'ajv-formats';
import { HttpResponse, ContractViolation } from '../types/index.js';

// ajv-formats is CJS; under NodeNext the callable lives on `.default` in some
// resolutions and is the module itself in others. Normalize to the function.
const addFormats: (ajv: Ajv) => unknown =
  (addFormatsModule as any).default ?? (addFormatsModule as any);

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

export interface MatchedOperation {
  method: string;     // lowercase, e.g. 'get'
  path: string;       // spec path template, e.g. '/users/{id}'
  operationId?: string;
  operation: any;     // the OpenAPI operation object
}

export interface OperationSummary {
  operationId: string;
  method: string;     // uppercase, e.g. 'GET'
  path: string;
  summary?: string;
}

// Matches a fired request to a spec path+method. If specOperationId is given it
// wins; otherwise the path is inferred by stripping baseUrl from the resolved
// URL and fuzzy-matching against spec path templates ({param} -> regex group).
export function findOperation(
  spec: any,
  method: string,
  resolvedUrl: string,
  baseUrl: string,
  specOperationId?: string,
): MatchedOperation | null {
  const paths = spec?.paths || {};
  const lowerMethod = method.toLowerCase();

  if (specOperationId) {
    for (const [path, pathItem] of Object.entries<any>(paths)) {
      for (const m of HTTP_METHODS) {
        const op = pathItem?.[m];
        if (op && op.operationId === specOperationId) {
          return { method: m, path, operationId: op.operationId, operation: op };
        }
      }
    }
    return null;
  }

  const reqPath = extractPath(resolvedUrl, baseUrl);

  for (const [path, pathItem] of Object.entries<any>(paths)) {
    if (!pathMatches(path, reqPath)) continue;
    const op = pathItem?.[lowerMethod];
    if (op) {
      return { method: lowerMethod, path, operationId: op.operationId, operation: op };
    }
  }
  return null;
}

// Strip protocol+host (or a configured baseUrl prefix) and the query string,
// leaving just the path to match against spec templates.
function extractPath(resolvedUrl: string, baseUrl: string): string {
  let url = resolvedUrl;
  if (baseUrl && url.startsWith(baseUrl)) {
    url = url.slice(baseUrl.length);
  } else if (/^https?:\/\//i.test(url)) {
    try {
      url = new URL(url).pathname;
    } catch {
      // leave as-is
    }
  }
  const q = url.indexOf('?');
  if (q !== -1) url = url.slice(0, q);
  if (!url.startsWith('/')) url = '/' + url;
  return url;
}

// A spec path template like /users/{id} matches /users/42 (each {param} slot
// matches a single non-slash segment).
function pathMatches(template: string, actual: string): boolean {
  const pattern = '^' + template.replace(/\{[^/}]+\}/g, '[^/]+').replace(/\//g, '\\/') + '$';
  return new RegExp(pattern).test(actual);
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Validates a response against a matched operation: status defined, body schema
// (for the status's application/json schema), and Content-Type.
export function validate(operation: any, response: HttpResponse): ContractViolation[] {
  const violations: ContractViolation[] = [];
  const responses = operation?.responses || {};
  const statusKey = String(response.status);

  const responseSpec = responses[statusKey] || responses[statusKey.replace(/\d{2}$/, 'XX')] || responses.default;
  if (!responseSpec) {
    violations.push({
      field: 'status',
      message: `Status ${response.status} is not defined for this operation`,
      severity: 'error',
    });
    return violations;
  }

  const content = responseSpec.content;
  if (content) {
    const jsonSpec = content['application/json'];

    // Content-Type check.
    const ct = (response.headers['content-type'] || response.headers['Content-Type'] || '').split(';')[0].trim();
    if (ct && !Object.keys(content).some(key => ct === key)) {
      violations.push({
        field: 'Content-Type',
        message: `Response Content-Type "${ct}" is not one of the spec's declared types: ${Object.keys(content).join(', ')}`,
        severity: 'warning',
      });
    }

    // Body schema check.
    if (jsonSpec?.schema) {
      const validateFn = ajv.compile(jsonSpec.schema);
      const ok = validateFn(response.body);
      if (!ok && validateFn.errors) {
        for (const err of validateFn.errors) {
          const field = err.instancePath ? err.instancePath.replace(/^\//, '').replace(/\//g, '.') : (err.params as any)?.missingProperty || '(root)';
          violations.push({
            field,
            message: `${field} ${err.message}`,
            severity: 'error',
          });
        }
      }
    }
  }

  return violations;
}

export function listOperations(spec: any): OperationSummary[] {
  const out: OperationSummary[] = [];
  const paths = spec?.paths || {};
  for (const [path, pathItem] of Object.entries<any>(paths)) {
    for (const m of HTTP_METHODS) {
      const op = pathItem?.[m];
      if (op) {
        out.push({ operationId: op.operationId, method: m.toUpperCase(), path, summary: op.summary });
      }
    }
  }
  return out;
}
