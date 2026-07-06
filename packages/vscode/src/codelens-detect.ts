/**
 * Pure detection + matching logic for the "Run with Reqly" CodeLens (T-236).
 * No vscode imports so it stays unit-testable with plain vitest.
 */
import { ReqlyCollection, ReqlyRequest } from './api';

export interface DetectedHttpCall {
  /** 0-indexed line of the call site */
  line: number;
  /** URL string as written in the source (template expressions kept verbatim) */
  url: string;
  /** Best-effort inferred HTTP method */
  method: string;
  /** True when the URL contains template-literal expressions */
  dynamic: boolean;
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

// fetch( / axios( / axios.get( / got( / got.post( / request(
// \b guards against prefetch(, myRequest( etc.; the negative lookbehind
// guards against object members like foo.fetch( being double-counted - we
// still allow axios.get style via the explicit member alternative.
const CALL_RE = /\b(fetch|axios|got|request)\s*(?:\.\s*([a-zA-Z]+)\s*)?\(\s*(['"`])/g;

function extractLiteral(source: string, start: number, quote: string): { text: string; dynamic: boolean } | undefined {
  let out = '';
  let dynamic = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '\\') {
      out += source[i + 1] ?? '';
      i++;
      continue;
    }
    if (ch === quote) return { text: out, dynamic };
    if (ch === '\n' && quote !== '`') return undefined;
    if (quote === '`' && ch === '$' && source[i + 1] === '{') dynamic = true;
    out += ch;
  }
  return undefined;
}

/** True when the string plausibly is a URL or path, not an arbitrary literal. */
function looksLikeUrl(text: string): boolean {
  return /^(https?:\/\/|\/|\$\{)/.test(text) || /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(text);
}

/**
 * Infer the method from fetch-style options following the URL argument:
 * scans the rest of the call's argument list for `method: 'POST'`.
 */
function inferMethodFromOptions(source: string, fromIndex: number): string | undefined {
  const span = source.slice(fromIndex, fromIndex + 300);
  // Stop at the end of the statement to avoid reading a neighbouring call.
  const stmt = span.split(';')[0];
  const m = stmt.match(/method\s*:\s*['"`]([a-zA-Z]+)['"`]/);
  return m ? m[1].toUpperCase() : undefined;
}

export function detectHttpCalls(source: string): DetectedHttpCall[] {
  const calls: DetectedHttpCall[] = [];
  CALL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CALL_RE.exec(source)) !== null) {
    const [, callee, member, quote] = m;
    if (member && !HTTP_METHODS.has(member.toLowerCase())) continue;

    const urlStart = m.index + m[0].length;
    const literal = extractLiteral(source, urlStart, quote);
    if (!literal || !looksLikeUrl(literal.text)) continue;

    let method = member ? member.toUpperCase() : 'GET';
    if (!member) {
      const optMethod = inferMethodFromOptions(source, urlStart + literal.text.length);
      if (optMethod) method = optMethod;
    }

    calls.push({
      line: source.slice(0, m.index).split('\n').length - 1,
      url: literal.text,
      method,
      dynamic: literal.dynamic,
    });
  }
  return calls;
}

export interface SavedRequestMatch {
  collection: ReqlyCollection;
  request: ReqlyRequest;
}

function pathOf(url: string): string {
  // Strip protocol+host from absolute URLs; strip {{var}} prefixes from
  // templated URLs. What remains is the path used for suffix comparison.
  const templated = url.replace(/\{\{[^}]+\}\}/g, '');
  const noProto = templated.replace(/^https?:\/\/[^/]*/i, '');
  return (noProto.startsWith('/') ? noProto : `/${noProto}`).replace(/\/+$/, '').split('?')[0];
}

/**
 * Best-effort lookup of a saved request matching a source-code URL.
 * Exact URL match wins; otherwise compares method + path (so
 * `{{baseUrl}}/users` matches `https://api.example.com/users`).
 */
export function matchSavedRequest(
  collections: ReqlyCollection[],
  url: string,
  method: string
): SavedRequestMatch | undefined {
  const wantedMethod = method.toUpperCase();
  let pathMatch: SavedRequestMatch | undefined;
  for (const collection of collections) {
    for (const request of collection.requests) {
      if (request.url === url && request.method.toUpperCase() === wantedMethod) {
        return { collection, request };
      }
      if (
        !pathMatch &&
        request.method.toUpperCase() === wantedMethod &&
        pathOf(request.url) === pathOf(url) &&
        pathOf(url) !== ''
      ) {
        pathMatch = { collection, request };
      }
    }
  }
  return pathMatch;
}
