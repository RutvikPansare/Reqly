import { fetch } from 'undici';
import { RequestConfig, Environment, AuthProfile, AuthType, HttpResponse } from '../types/index.js';
import { runScript } from './script-runner.js';

export class RequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestError';
  }
}

import { resolveVariables } from './variable-substitutor.js';


export async function execute(
  config: RequestConfig,
  env?: Environment,
  auth?: AuthProfile,
  truncate: boolean = true,
  maxBodyBytes: number = 50 * 1024,
  collectionVars: Record<string, string> = {},
  collectionAuth?: AuthProfile
): Promise<HttpResponse> {
  const envVars = env?.variables || {};
  // Layered scope chain: collection vars win over env vars on collision.
  const layers = [collectionVars, envVars];
  const consoleLogs: string[] = [];

  // Run preScript before substitution so env mutations are picked up.
  // Scripts read/write the env-vars layer; collection vars are read-only inherited.
  if (config.preScript) {
    const { consoleLogs: pre } = runScript(config.preScript, { env: envVars, request: config as unknown as Record<string, unknown> });
    consoleLogs.push(...pre);
  }

  let url = resolveVariables(config.url, layers);

  if (config.params) {
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(config.params)) {
      searchParams.append(k, resolveVariables(v, layers));
    }
    const qs = searchParams.toString();
    if (qs) {
      url += (url.includes('?') ? '&' : '?') + qs;
    }
  }

  const headers: Record<string, string> = {};
  if (config.headers) {
    for (const [k, v] of Object.entries(config.headers)) {
      headers[k] = resolveVariables(v, layers);
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
    body = resolveVariables(body, layers);
  } else if (body && typeof body === 'object') {
    body = JSON.stringify(body);
    body = resolveVariables(body, layers);
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  // Resolve effective auth with precedence:
  //   request-level auth (resolved profile OR inline, including explicit none) > collection auth > none.
  // An explicit `type: 'none'` on the request opts out of inherited collection auth entirely.
  // The caller is responsible for resolving any profileId (request or collection) into a
  // concrete {type, credentials} object before passing it here - the executor holds no AuthManager.
  let effectiveAuth: AuthProfile | undefined;
  if (config.auth?.type === 'none') {
    effectiveAuth = undefined;
  } else if (auth) {
    effectiveAuth = auth;
  } else if (config.auth) {
    effectiveAuth = config.auth as AuthProfile;
  } else if (config.authProfileId) {
    // Request specified a profile but the caller did not resolve it; do not inherit.
    effectiveAuth = undefined;
  } else if (collectionAuth && collectionAuth.type !== ('none' as AuthType)) {
    effectiveAuth = collectionAuth;
  }

  if (effectiveAuth) {
    const auth: AuthProfile = { ...effectiveAuth, credentials: effectiveAuth.credentials || {} };
    if (auth.type === AuthType.BEARER && auth.credentials.token) {
      headers['Authorization'] = `Bearer ${auth.credentials.token}`;
    } else if (auth.type === AuthType.BASIC && auth.credentials.username) {
      const { username, password = '' } = auth.credentials;
      headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    } else if (auth.type === AuthType.API_KEY && auth.credentials.key) {
      headers['x-api-key'] = auth.credentials.key;
    } else if (auth.type === AuthType.OAUTH2) {
      const { accessToken, expiresAt } = auth.credentials;
      // Only inject if we have a token; the executor does not refresh here -
      // callers (express route / MCP tool) should call AuthManager.refreshOAuth2Token
      // before execute() when the token is expired. Callers can detect expiry via:
      //   expiresAt && Date.now() > Number(expiresAt) - 60_000
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
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
    const { consoleLogs: post } = runScript(config.postScript, { env: envVars, request: config as unknown as Record<string, unknown>, response: result as unknown as Record<string, unknown> });
    consoleLogs.push(...post);
  }

  if (consoleLogs.length > 0) result.consoleLogs = consoleLogs;

  return result;
}
