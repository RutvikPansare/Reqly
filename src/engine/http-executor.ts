import { fetch, Agent } from 'undici';
import { loadCert, CertLoadError } from './cert-loader.js';
import * as fs from 'fs';
import * as path from 'path';
import { RequestConfig, Environment, AuthProfile, AuthType, HttpResponse, MultipartBody } from '../types/index.js';
import { runScript, RunnerContext } from './script-runner.js';
import aws4 from 'aws4';

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

// Resolve a scriptFile reference to its content, enforcing that the resolved
// path stays within baseDir (no path traversal). Returns the script string on
// success, or an error message string prefixed with '[error]' on failure.
function resolveScriptFile(scriptFile: string, baseDir: string): { script?: string; error?: string } {
  const resolved = path.resolve(baseDir, scriptFile);
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep) && resolved !== path.resolve(baseDir)) {
    return { error: `[error] Script file '${scriptFile}' is outside the collection folder - path traversal rejected` };
  }
  if (!fs.existsSync(resolved)) {
    return { error: `[error] Script file not found: ${scriptFile}` };
  }
  return { script: fs.readFileSync(resolved, 'utf8') };
}


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
  resolvedFiles?: Record<string, Buffer>,
  scriptVars: Record<string, string> = {},
  onScriptVarSet?: (key: string, value: string) => void,
  runnerContext?: RunnerContext
): Promise<HttpResponse> {
  const envVars = env?.variables || {};
  // Layered scope chain: script vars > collection vars > env vars > .env-file vars.
  const layers = [scriptVars, collectionVars, envVars, dotEnvVars];
  const consoleLogs: string[] = [];

  // GraphQL requests are always POST - override if not explicitly set to something else
  const effectiveMethod = (config.type === 'graphql' && !config.method) ? 'POST' : config.method as string;

  // Mutable req state that the preScript can mutate via req.setUrl() etc.
  // Mutations are applied to the local vars below before the request fires.
  const reqMut = {
    _url: config.url,
    _method: effectiveMethod,
    _headers: { ...(config.headers ?? {}) },
    _body: config.body as unknown,
    _timeout: undefined as number | undefined,
    _maxRedirects: undefined as number | undefined,
    getUrl()                     { return reqMut._url; },
    setUrl(u: string)            { reqMut._url = u; },
    getMethod()                  { return reqMut._method; },
    setMethod(m: string)         { reqMut._method = m; },
    getHeaders()                 { return { ...reqMut._headers }; },
    getHeader(n: string)         { return reqMut._headers[n] ?? reqMut._headers[n.toLowerCase()] ?? undefined; },
    setHeader(n: string, v: string) { reqMut._headers[n] = v; },
    removeHeader(n: string)      { delete reqMut._headers[n]; },
    getBody()                    { return reqMut._body; },
    setBody(b: unknown)          { reqMut._body = b; },
    setTimeout(ms: number)       { reqMut._timeout = ms; },
    setMaxRedirects(n: number)   { reqMut._maxRedirects = n; },
  };

  // Run preScript before substitution so env mutations and req mutations are
  // both picked up before variable resolution and fetch options are built.
  // Inline preScript wins over preScriptFile; warn if both are set.
  {
    let preScriptSrc: string | undefined = config.preScript;
    if (config.preScript && config.preScriptFile) {
      consoleLogs.push('[warn] Both preScript and preScriptFile are set - preScript takes precedence');
    } else if (config.preScriptFile && baseDir) {
      const { script, error } = resolveScriptFile(config.preScriptFile, baseDir);
      if (error) { consoleLogs.push(error); }
      else { preScriptSrc = script; }
    }
    if (preScriptSrc) {
      const { consoleLogs: pre } = runScript(preScriptSrc, {
        env: envVars,
        request: config as unknown as Record<string, unknown>,
        req: reqMut as unknown as Record<string, unknown>,
        scriptVars,
        onScriptVarSet
      });
      consoleLogs.push(...pre);
    }
  }

  let url = resolveVariables(reqMut._url, layers);

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

  // Start from req-mutated headers; resolve variables in values.
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(reqMut._headers)) {
    headers[k] = resolveVariables(v, layers);
  }

  let body = reqMut._body as typeof config.body;

  // Resolve effective auth early so dispatcher (mTLS) is available for all fetch paths.
  let effectiveAuthEarly: AuthProfile | undefined;
  if (config.auth?.type === 'none') {
    effectiveAuthEarly = undefined;
  } else if (auth) {
    effectiveAuthEarly = auth;
  } else if (config.auth) {
    effectiveAuthEarly = config.auth as AuthProfile;
  } else if (!config.authProfileId && collectionAuth && collectionAuth.type !== ('none' as AuthType)) {
    effectiveAuthEarly = collectionAuth;
  }

  let sharedDispatcher: Agent | undefined;
  if (effectiveAuthEarly?.type === AuthType.MTLS) {
    const { certPath: rawCert, keyPath: rawKey, pfxPath: rawPfx, passphrase: rawPassphrase, caPath: rawCa } = effectiveAuthEarly.credentials;

    const certPath = rawCert ? resolveVariables(rawCert, layers) : undefined;
    const keyPath = rawKey ? resolveVariables(rawKey, layers) : undefined;
    const pfxPath = rawPfx ? resolveVariables(rawPfx, layers) : undefined;
    const passphrase = rawPassphrase ? resolveVariables(rawPassphrase, layers) : undefined;
    const caPath = rawCa ? resolveVariables(rawCa, layers) : undefined;

    if (!pfxPath && (!certPath || !keyPath)) {
      throw new RequestError('mTLS auth requires either pfxPath, or both certPath and keyPath');
    }
    try {
      const certBuffers = loadCert({ certPath, keyPath, pfxPath, passphrase, caPath });
      const connectOpts: any = {};
      if (certBuffers.cert) connectOpts.cert = certBuffers.cert;
      if (certBuffers.key) connectOpts.key = certBuffers.key;
      if (certBuffers.pfx) connectOpts.pfx = certBuffers.pfx;
      if (certBuffers.passphrase !== undefined) connectOpts.passphrase = certBuffers.passphrase;
      if (certBuffers.ca) connectOpts.ca = certBuffers.ca;
      
      sharedDispatcher = new Agent({ connect: connectOpts });
    } catch (e: any) {
      throw new RequestError(`mTLS cert load failed: ${e.message}`);
    }
  }

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
      response = await fetch(url, { method: reqMut._method, headers, body: formData as any, ...(sharedDispatcher ? { dispatcher: sharedDispatcher } : {}) } as any);
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
    {
      let postScriptSrc: string | undefined = config.postScript;
      if (config.postScript && config.postScriptFile) {
        consoleLogs.push('[warn] Both postScript and postScriptFile are set - postScript takes precedence');
      } else if (config.postScriptFile && baseDir) {
        const { script, error } = resolveScriptFile(config.postScriptFile, baseDir);
        if (error) { consoleLogs.push(error); }
        else { postScriptSrc = script; }
      }
      if (postScriptSrc) {
      const envVarsForScript = env?.variables || {};
      const { consoleLogs: post, testResults, flowControl } = runScript(postScriptSrc, {
        env: envVarsForScript,
        request: config as unknown as Record<string, unknown>,
        response: multipartResult as unknown as Record<string, unknown>,
        scriptVars,
        onScriptVarSet,
        runnerContext,
      });
      if (post.length > 0) multipartResult.consoleLogs = [...consoleLogs, ...post];
      else if (consoleLogs.length > 0) multipartResult.consoleLogs = consoleLogs;
      if (testResults.length > 0) multipartResult.testResults = testResults;
      if (runnerContext) (multipartResult as any)._flowControl = flowControl;
      } else if (consoleLogs.length > 0) {
        multipartResult.consoleLogs = consoleLogs;
      }
    }
    return multipartResult;
  }

  if (config.type === 'graphql' && config.graphql) {
    let queryStr = config.graphql.query || '';
    if (config.graphql.queryFile && baseDir) {
      // Find the project root by looking for .reqly or using process.cwd() as fallback
      // Since baseDir might be `<root>/.reqly/<collection>` or `<root>`, we climb up if needed.
      const resolvedPath = resolveVariables(config.graphql.queryFile, layers);
      let pRoot = baseDir;
      const reqlyIndex = baseDir.lastIndexOf(path.sep + '.reqly');
      if (reqlyIndex !== -1) {
        pRoot = baseDir.substring(0, reqlyIndex);
      } else if (baseDir.endsWith('.reqly')) {
        pRoot = baseDir.substring(0, baseDir.length - 6);
      }
      
      const fileTarget = path.resolve(pRoot, resolvedPath);
      if (!fs.existsSync(fileTarget)) {
         throw new Error(`[error] GraphQL queryFile not found: ${resolvedPath} (resolved to ${fileTarget})`);
      }
      queryStr = fs.readFileSync(fileTarget, 'utf8');
    }
    const gqlBody: Record<string, unknown> = { query: queryStr };
    if (config.graphql.variables !== undefined) {
      gqlBody.variables = config.graphql.variables;
    }
    if (config.graphql.operationName !== undefined) {
      gqlBody.operationName = config.graphql.operationName;
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
    } else if (auth.type === AuthType.AWS_V4) {
      const { accessKey, secretKey, region, service, sessionToken } = auth.credentials;
      if (accessKey && secretKey) {
        const parsed = new URL(url);
        const signingOpts: Record<string, any> = {
          host: parsed.host,
          method: reqMut._method,
          path: parsed.pathname + (parsed.search || ''),
          service: service || 'execute-api',
          region: region || 'us-east-1',
          headers: { ...headers },
        };
        if (body && typeof body === 'string') {
          signingOpts.body = body;
        }
        const awsCreds: Record<string, string> = { accessKeyId: accessKey, secretAccessKey: secretKey };
        if (sessionToken) awsCreds.sessionToken = sessionToken;
        aws4.sign(signingOpts, awsCreds);
        Object.assign(headers, signingOpts.headers);
      }
    }
  }

  const startTime = Date.now();
  let response;
  try {
    response = await fetch(url, {
      method: reqMut._method,
      headers,
      body: body as string | undefined,
      ...(sharedDispatcher ? { dispatcher: sharedDispatcher } : {}),
    } as any);
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

  {
    let postScriptSrc: string | undefined = config.postScript;
    if (config.postScript && config.postScriptFile) {
      consoleLogs.push('[warn] Both postScript and postScriptFile are set - postScript takes precedence');
    } else if (config.postScriptFile && baseDir) {
      const { script, error } = resolveScriptFile(config.postScriptFile, baseDir);
      if (error) { consoleLogs.push(error); }
      else { postScriptSrc = script; }
    }
    if (postScriptSrc) {
      const { consoleLogs: post, testResults, flowControl } = runScript(postScriptSrc, {
        env: envVars,
        request: config as unknown as Record<string, unknown>,
        response: result as unknown as Record<string, unknown>,
        scriptVars,
        onScriptVarSet,
        runnerContext,
      });
      consoleLogs.push(...post);
      if (testResults.length > 0) result.testResults = testResults;
      if (runnerContext) (result as any)._flowControl = flowControl;
    }
  }

  if (consoleLogs.length > 0) result.consoleLogs = consoleLogs;

  return result;
}
