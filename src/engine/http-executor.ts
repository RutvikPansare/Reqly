import { fetch } from 'undici';
import { RequestConfig, Environment, AuthProfile, AuthType, HttpResponse } from '../types/index.js';

export class RequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestError';
  }
}

function substitute(str: string, variables: Record<string, string>): string {
  return str.replace(/\{\{(.*?)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}

export async function execute(
  config: RequestConfig,
  env?: Environment,
  auth?: AuthProfile
): Promise<HttpResponse> {
  const vars = env?.variables || {};

  let url = substitute(config.url, vars);
  
  if (config.params) {
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(config.params)) {
      searchParams.append(k, substitute(v, vars));
    }
    const qs = searchParams.toString();
    if (qs) {
      url += (url.includes('?') ? '&' : '?') + qs;
    }
  }

  const headers: Record<string, string> = {};
  if (config.headers) {
    for (const [k, v] of Object.entries(config.headers)) {
      headers[k] = substitute(v, vars);
    }
  }

  let body = config.body;
  if (typeof body === 'string') {
    body = substitute(body, vars);
  } else if (body && typeof body === 'object') {
    // For object bodies (like JSON), we could stringify, substitute, then parse, or just send as JSON
    // The spec says JSON body, form body, raw body. If it's an object, we assume JSON.
    body = JSON.stringify(body);
    body = substitute(body, vars);
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  if (auth) {
    if (auth.type === AuthType.BEARER && auth.credentials.token) {
      headers['Authorization'] = `Bearer ${auth.credentials.token}`;
    } else if (auth.type === AuthType.BASIC && auth.credentials.username) {
      const { username, password = '' } = auth.credentials;
      headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    } else if (auth.type === AuthType.API_KEY && auth.credentials.key) {
      // Simplification: assume header injection for API key if not specified
      // Typically API key is either header or query param. We'll default to header 'x-api-key' for now.
      headers['x-api-key'] = auth.credentials.key;
    }
  }

  const startTime = Date.now();
  let response;
  try {
    response = await fetch(url, {
      method: config.method,
      headers,
      body: body as string | undefined,
    });
  } catch (err: any) {
    throw new RequestError(err.message || 'Network Error');
  }
  const latency = Date.now() - startTime;

  const resHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    resHeaders[k] = v;
  });

  const text = await response.text();
  let parsedBody: string | Record<string, unknown> | null = text;
  
  if (text) {
    try {
      parsedBody = JSON.parse(text);
    } catch {
      // keep as text
    }
  } else {
    parsedBody = null;
  }

  return {
    status: response.status,
    body: parsedBody,
    headers: resHeaders,
    latency,
    timestamp: new Date().toISOString(),
  };
}
