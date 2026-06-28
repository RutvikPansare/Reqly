import { fetch } from 'undici';
import * as fs from 'fs';
import * as path from 'path';
import { RequestConfig, Environment, AuthProfile, AuthType, HttpResponse, MultipartBody } from '../types/index.js';
import { runScript } from './script-runner.js';

export class RequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestError';
  }
}

// undici's fetch wraps connection failures in a generic "fetch failed" TypeError,
// with the actual cause (ECONNREFUSED/ENOTFOUND/ETIMEDOUT) nested in err.cause.code.
// Surface it in the message so the UI's contextual error hints can match on it.
function formatNetworkError(err: any): string {
  const message = err?.message || 'Network Error';
  const code = err?.cause?.code;
  return code && !message.includes(code) ? `${message} (${code})` : message;
}

import { resolveVariables } from './variable-substitutor.js';


export async function execute(
  config: RequestConfig,
  env?: Environment,
  auth?: AuthProfile,
  truncate: boolean = true,
  maxBodyBytes: number = 50 * 1024,
  collectionVars: Record<string, string> = {},
  collectionAuth?: AuthProfile,
  dotEnvVars: Record<string, string> = {},
  baseDir?: string,
  resolvedFiles?: Record<string, Buffer>
): Promise<HttpResponse> {
  const envVars = env?.variables || {};
  // Layered scope chain: collection vars > env vars > .env-file vars.
  const layers = [collectionVars, envVars, dotEnvVars];
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

  // Multipart branch: build a FormData from parts. Must come before the generic
  // object branch so that { type: 'multipart', parts: [...] } is not JSON-stringified.
  if (body && typeof body === 'object' && (body as MultipartBody).type === 'multipart') {
    const multipart = body as MultipartBody;
    const formData = new FormData();
    for (const part of multipart.parts) {
      if (part.type === 'text') {
        formData.append(part.name, part.value ?? '');
      } else {
        // File part: use a pre-resolved buffer (from multer/browser upload) if available,
        // otherwise read from disk via filePath (relative to baseDir or absolute).
        let fileBytes: Buffer | undefined;
        let filename: string;

        if (resolvedFiles && resolvedFiles[part.name]) {
          fileBytes = resolvedFiles[part.name];
          filename = part.filePath ? path.basename(part.filePath) : part.name;
        } else {
          const resolvedPath = part.filePath && !path.isAbsolute(part.filePath) && baseDir
            ? path.join(baseDir, part.filePath)
            : (part.filePath ?? '');
          if (!fs.existsSync(resolvedPath)) {
            return {
              status: 0,
              body: { error: `File not found: ${part.filePath ?? resolvedPath}` },
              headers: {},
              latency: 0,
              timestamp: new Date().toISOString(),
            };
          }
          fileBytes = fs.readFileSync(resolvedPath);
          filename = path.basename(resolvedPath);
        }

        const mimeType = part.contentType ?? 'application/octet-stream';
        const blob = new File([new Uint8Array(fileBytes)], filename, { type: mimeType });
        formData.append(part.name, blob, filename);
      }
    }
    // Assign FormData as the fetch body. Do NOT set Content-Type manually;
    // undici/fetch sets multipart/form-data with the correct boundary automatically.
    body = formData as unknown as string;

    const startTime = Date.now();
    let response;
    try {
      response = await fetch(url, { method: config.method, headers, body: formData as any });
    } catch (err: any) {
      throw new RequestError(formatNetworkError(err));
    }
    const latency = Date.now() - startTime;
    const resHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => { resHeaders[k] = v; });
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    let finalBodyBuffer = buffer;
    let isTruncated = false;
    if (truncate && buffer.length > maxBodyBytes) {
      finalBodyBuffer = buffer.subarray(0, maxBodyBytes);
      isTruncated = true;
    }
    let text = '';
    try { text = finalBodyBuffer.toString('utf8'); } catch { /* keep empty */ }
    let parsedBody: string | Record<string, unknown> | null = text;
    if (text) { try { parsedBody = JSON.parse(text); } catch { /* keep as text */ } }
    else { parsedBody = null; }
    let fullParsedBody: string | Record<string, unknown> | null = null;
    if (isTruncated) {
      let fullText = '';
      try { fullText = buffer.toString('utf8'); try { fullParsedBody = JSON.parse(fullText); } catch { fullParsedBody = fullText; } } catch { /* ignore */ }
      const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
      const msg = `\n\n[Response truncated: ${sizeMb}MB received, showing first 50KB. Use --full to retrieve complete response.]`;
      if (typeof parsedBody === 'string') { parsedBody += msg; } else { parsedBody = (text || '') + msg; }
    }
    const multipartResult: HttpResponse = {
      status: response.status,
      body: parsedBody,
      ...(isTruncated ? { fullBody: fullParsedBody } : {}),
      headers: resHeaders,
      latency,
      timestamp: new Date().toISOString(),
    };
    if (config.postScript) {
      const envVarsForScript = env?.variables || {};
      const { consoleLogs: post } = runScript(config.postScript, { env: envVarsForScript, request: config as unknown as Record<string, unknown>, response: multipartResult as unknown as Record<string, unknown> });
      if (post.length > 0) multipartResult.consoleLogs = post;
    }
    return multipartResult;
  }

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
    throw new RequestError(formatNetworkError(err));
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
