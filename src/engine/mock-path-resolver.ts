// Resolves the mock-server route path for a request. If `mockPath` is set it
// wins verbatim; otherwise the path is inferred from the request URL by
// stripping protocol+host (or a leading `{{baseUrl}}`-style placeholder),
// dropping the query string, and converting `{{var}}` segments to `:var`
// (Express route params).

interface MockPathInput {
  url: string;
  mockPath?: string;
}

export function resolveMockPath(request: MockPathInput): string {
  if (request.mockPath) return request.mockPath;

  let p = inferPath(request.url);

  // {{var}} -> :var
  p = p.replace(/\{\{(\w+)\}\}/g, ':$1');

  // strip query string
  const q = p.indexOf('?');
  if (q !== -1) p = p.slice(0, q);

  if (!p.startsWith('/')) p = '/' + p;
  return p;
}

function inferPath(url: string): string {
  // Absolute URL with a real protocol+host.
  if (/^https?:\/\//i.test(url)) {
    try {
      return new URL(url).pathname;
    } catch {
      // fall through to other strategies
    }
  }

  // Leading variable placeholder acting as the base URL, e.g. {{baseUrl}}/users.
  const m = url.match(/^\{\{\w+\}\}(.*)$/);
  if (m) return m[1] || '/';

  // Already a bare path.
  return url;
}
