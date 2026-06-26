import { fetch } from 'undici';
import { RequestConfig, Environment, AuthProfile, AuthType, HttpResponse } from '../types/index.js';
import { runScript } from './script-runner.js';

export class RequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestError';
  }
}

import { substitute } from './variable-substitutor.js';


export async function execute(
  config: RequestConfig,
  env?: Environment,
  auth?: AuthProfile,
  truncate: boolean = true,
  maxBodyBytes: number = 50 * 1024
): Promise<HttpResponse> {
  const vars = env?.variables || {};
  const consoleLogs: string[] = [];

  // Run preScript before substitution so env mutations are picked up
  if (config.preScript) {
    const { consoleLogs: pre } = runScript(config.preScript, { env: vars, request: config as unknown as Record<string, unknown> });
    consoleLogs.push(...pre);
  }

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
  if (config.type === 'graphql' && config.graphql) {
    const gqlBody: Record<string, unknown> = { query: config.graphql.query };
    if (config.graphql.variables !== undefined) {
      gqlBody.variables = config.graphql.variables;
    }
    body = JSON.stringify(gqlBody);
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  } else if (typeof body === 'string') {
    body = substitute(body, vars);
  } else if (body && typeof body === 'object') {
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

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  let finalBodyBuffer = buffer;
  let isTruncated = false;

  if (truncate && buffer.length > maxBodyBytes) {
    finalBodyBuffer = buffer.subarray(0, maxBodyBytes);
    isTruncated = true;
  }

  let text = '';
  try {
    text = finalBodyBuffer.toString('utf8');
  } catch {
    // Keep empty or best effort if not utf8
  }

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

  let fullParsedBody: string | Record<string, unknown> | null = null;

  if (isTruncated) {
    let fullText = '';
    try {
      fullText = buffer.toString('utf8');
      try {
        fullParsedBody = JSON.parse(fullText);
      } catch {
        fullParsedBody = fullText;
      }
    } catch {
      fullParsedBody = null;
    }

    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
    const msg = `\n\n[Response truncated: ${sizeMb}MB received, showing first 50KB. Use --full to retrieve complete response.]`;
    if (typeof parsedBody === 'string') {
      parsedBody += msg;
    } else {
      parsedBody = (text || '') + msg;
    }
  }

  const result: HttpResponse = {
    status: response.status,
    body: parsedBody,
    ...(isTruncated ? { fullBody: fullParsedBody } : {}),
    headers: resHeaders,
    latency,
    timestamp: new Date().toISOString(),
  };

  if (config.postScript) {
    const { consoleLogs: post } = runScript(config.postScript, { env: vars, request: config as unknown as Record<string, unknown>, response: result as unknown as Record<string, unknown> });
    consoleLogs.push(...post);
  }

  if (consoleLogs.length > 0) result.consoleLogs = consoleLogs;

  return result;
}
