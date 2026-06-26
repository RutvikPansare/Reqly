export type CodeTarget = 'curl' | 'fetch' | 'axios';

export interface CodeGenRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
}

function bodyString(body: string | Record<string, unknown> | undefined): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body.trim() || undefined;
  return JSON.stringify(body);
}

export function generateCode(request: CodeGenRequest, target: CodeTarget): string {
  switch (target) {
    case 'curl':  return generateCurl(request);
    case 'fetch': return generateFetch(request);
    case 'axios': return generateAxios(request);
  }
}

function generateCurl(req: CodeGenRequest): string {
  const lines: string[] = [];
  const method = (req.method || 'GET').toUpperCase();
  const body = bodyString(req.body);

  const firstLine = method === 'GET'
    ? `curl '${req.url}'`
    : `curl -X ${method} '${req.url}'`;
  lines.push(firstLine);

  for (const [k, v] of Object.entries(req.headers ?? {})) {
    lines.push(`  -H '${k}: ${v}'`);
  }

  if (body !== undefined) {
    lines.push(`  --data-raw '${body}'`);
  }

  return lines.join(' \\\n');
}

function generateFetch(req: CodeGenRequest): string {
  const method = (req.method || 'GET').toUpperCase();
  const body = bodyString(req.body);
  const headers = req.headers ?? {};
  const hasHeaders = Object.keys(headers).length > 0;
  const hasOptions = method !== 'GET' || hasHeaders || body !== undefined;

  if (!hasOptions) {
    return [
      `const response = await fetch('${req.url}');`,
      `const data = await response.json();`,
      `console.log(data);`,
    ].join('\n');
  }

  const opts: string[] = [];
  if (method !== 'GET') opts.push(`  method: '${method}'`);

  if (hasHeaders) {
    const headerLines = Object.entries(headers)
      .map(([k, v]) => `    '${k}': '${v}'`)
      .join(',\n');
    opts.push(`  headers: {\n${headerLines}\n  }`);
  }

  if (body !== undefined) {
    const bodyExpr = isJsonString(body) ? `JSON.stringify(${body})` : `'${body}'`;
    opts.push(`  body: ${bodyExpr}`);
  }

  return [
    `const response = await fetch('${req.url}', {`,
    opts.join(',\n'),
    `});`,
    `const data = await response.json();`,
    `console.log(data);`,
  ].join('\n');
}

function generateAxios(req: CodeGenRequest): string {
  const method = (req.method || 'GET').toUpperCase();
  const body = bodyString(req.body);
  const headers = req.headers ?? {};
  const hasHeaders = Object.keys(headers).length > 0;

  const opts: string[] = [
    `  method: '${method}'`,
    `  url: '${req.url}'`,
  ];

  if (hasHeaders) {
    const headerLines = Object.entries(headers)
      .map(([k, v]) => `    '${k}': '${v}'`)
      .join(',\n');
    opts.push(`  headers: {\n${headerLines}\n  }`);
  }

  if (body !== undefined) {
    const dataExpr = isJsonString(body) ? body : `'${body}'`;
    opts.push(`  data: ${dataExpr}`);
  }

  return [
    `import axios from 'axios';`,
    ``,
    `const response = await axios({`,
    opts.join(',\n'),
    `});`,
    `console.log(response.data);`,
  ].join('\n');
}

function isJsonString(s: string): boolean {
  try { JSON.parse(s); return true; } catch { return false; }
}
