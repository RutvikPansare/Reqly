import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as http from 'http';
import * as crypto from 'crypto';
import { EngineContext } from '../mcp/tools/types.js';
import { CollectionManager } from '../engine/collection-manager.js';
import { EnvironmentManager } from '../engine/environment-manager.js';
import { writeLock, readLock } from './lock.js';
import { fileURLToPath } from 'url';
import { parseCurl } from '../engine/curl-parser.js';
import { generateCode } from '../engine/code-generator.js';
import { exportToPostman, exportToOpenApi } from '../engine/exporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export function startExpressServer(context: EngineContext, port: number = 4242) {
  const app = express();
  
  app.use(cors());
  app.use(express.json());

  app.use((req, res, next) => {
    console.error(`[Express] Received request: ${req.method} ${req.path}`);
    next();
  });

  // Engine API Routes
  app.post('/api/proxy/start', async (req, res) => {
    try {
      await context.proxyServer.start({ 
        port: req.body.port || 7474, 
        collectionName: req.body.collectionName || 'captured' 
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/proxy/stop', async (req, res) => {
    try {
      await context.proxyServer.stop();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/proxy/captured', (req, res) => {
    res.json(context.proxyServer.capturedRequests);
  });

  app.delete('/api/proxy/captured', (req, res) => {
    context.proxyServer.capturedRequests = [];
    res.json({ success: true });
  });

  app.post('/api/tunnel/start', async (req, res) => {
    try {
      const url = await context.tunnelManager.start(port);
      res.json({ success: true, url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/tunnel/stop', (req, res) => {
    context.tunnelManager.stop();
    res.json({ success: true });
  });

  app.get('/api/tunnel/status', (req, res) => {
    res.json(context.tunnelManager.getStatus());
  });

  app.use('/webhooks', async (req, res) => {
    try {
      const collectionName = 'Webhooks';
      try {
        await context.collectionManager.getCollection(collectionName);
      } catch {
        await context.collectionManager.createCollection(collectionName);
      }

      // Add /webhooks to the saved path since it's stripped by app.use mount
      const fullPath = '/webhooks' + req.url;
      const name = `${req.method} ${fullPath}`.replace(/[^a-zA-Z0-9- /]/g, '').trim().substring(0, 30);
      await context.collectionManager.addRequest(collectionName, {
        id: Date.now().toString(),
        name: `${name} ${Date.now()}`,
        method: req.method as any,
        url: fullPath,
        headers: req.headers as Record<string, string>,
        body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? '')
      });

      res.json({ ok: true, message: "Webhook captured by Reqly" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/capture/inbound', async (req, res) => {
    try {
      const { method, url, headers, body, collection } = req.body;
      const collectionName = collection || 'Captured';

      try {
        await context.collectionManager.getCollection(collectionName);
      } catch {
        await context.collectionManager.createCollection(collectionName);
      }

      const existingCollection = await context.collectionManager.getCollection(collectionName);
      const alreadyCaptured = existingCollection.requests.some(
        (r) => r.method === method && r.url === url
      );

      if (!alreadyCaptured) {
        const name = `${method} ${url}`.replace(/[^a-zA-Z0-9- ]/g, '').trim().substring(0, 30);
        await context.collectionManager.addRequest(collectionName, {
          id: Date.now().toString(),
          name: `${name} ${Date.now()}`,
          method,
          url,
          headers,
          body: typeof body === 'string' ? body : JSON.stringify(body ?? '')
        });
      }

      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/collections', async (req, res) => {
    try {
      const cols = await context.collectionManager.listCollections();
      res.json(cols);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/import', async (req, res) => {
    try {
      const { content, format, collectionName } = req.body as {
        content: string;
        format: 'postman' | 'bruno';
        collectionName?: string;
      };
      if (!content) return res.status(400).json({ error: 'content is required' });
      if (format !== 'postman' && format !== 'bruno') {
        return res.status(400).json({ error: 'format must be "postman" or "bruno"' });
      }
      const { importFromContent } = await import('../engine/importer.js');
      const result = await importFromContent(content, format, context.collectionManager, collectionName);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/collections', async (req, res) => {
    try {
      const col = await context.collectionManager.createCollection(req.body.name);
      res.json(col);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/collections/:name', async (req, res) => {
    try {
      await context.collectionManager.renameCollection(req.params.name, req.body.name);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/collections/:name', async (req, res) => {
    try {
      await context.collectionManager.deleteCollection(req.params.name);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/collections/:name/duplicate', async (req, res) => {
    try {
      await context.collectionManager.duplicateRequest(
        req.params.name,
        req.body.requestName,
        req.body.newName
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/collections/:name/requests', async (req, res) => {
    try {
      await context.collectionManager.addRequest(req.params.name, req.body);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/collections/:name/requests/:requestName', async (req, res) => {
    try {
      if (req.params.requestName !== req.body.name) {
        // Handle rename: delete old, add new
        await context.collectionManager.deleteRequest(req.params.name, req.params.requestName);
      }
      await context.collectionManager.addRequest(req.params.name, req.body);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/collections/:name/requests/:requestName', async (req, res) => {
    try {
      await context.collectionManager.deleteRequest(req.params.name, req.params.requestName);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/auth-profiles', async (req, res) => {
    try {
      const profiles = await context.authManager.listProfiles();
      res.json(profiles);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/auth-profiles', async (req, res) => {
    try {
      const profile = await context.authManager.createProfile(req.body);
      res.json(profile);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/auth-profiles/:id', async (req, res) => {
    try {
      await context.authManager.deleteProfile(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // OAuth2: manual token refresh
  app.post('/api/auth-profiles/:id/refresh', async (req, res) => {
    try {
      const updated = await context.authManager.refreshOAuth2Token(req.params.id);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // OAuth2: initiate authorization code + PKCE flow
  // Opens the system browser at the provider's authUrl, starts a temporary
  // local HTTP callback server, exchanges the code for tokens, stores them.
  app.post('/api/auth-profiles/:id/authorize', async (req, res) => {
    try {
      const profile = await context.authManager.getProfile(req.params.id);
      const { clientId, authUrl, tokenUrl, redirectUri, scope, clientSecret } = profile.credentials;

      if (!authUrl) return res.status(400).json({ error: 'No authUrl configured on profile' }) as any;
      if (!tokenUrl) return res.status(400).json({ error: 'No tokenUrl configured on profile' }) as any;
      if (!clientId) return res.status(400).json({ error: 'No clientId configured on profile' }) as any;

      // PKCE
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      const state = crypto.randomBytes(16).toString('hex');

      // Parse the redirect URI to get the callback port
      const callbackUri = redirectUri || 'http://localhost:9876/callback';
      const callbackUrl = new URL(callbackUri);
      const callbackPort = parseInt(callbackUrl.port || '9876', 10);

      // Build authorization URL
      const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: callbackUri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        ...(scope ? { scope } : {}),
      });
      const fullAuthUrl = `${authUrl}?${authParams.toString()}`;

      // Start local callback server
      const codePromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          server.close();
          reject(new Error('OAuth2 authorization timed out after 5 minutes'));
        }, 5 * 60 * 1000);

        const server = http.createServer((cbReq, cbRes) => {
          const cbUrl = new URL(cbReq.url || '/', `http://localhost:${callbackPort}`);
          const returnedState = cbUrl.searchParams.get('state');
          const code = cbUrl.searchParams.get('code');
          const error = cbUrl.searchParams.get('error');

          cbRes.writeHead(200, { 'Content-Type': 'text/html' });
          if (error || returnedState !== state || !code) {
            cbRes.end('<html><body><h2>Authorization failed</h2><p>You can close this tab.</p></body></html>');
            clearTimeout(timeout);
            server.close();
            reject(new Error(error || 'Authorization failed: invalid state or missing code'));
            return;
          }
          cbRes.end('<html><body><h2>Authorization successful!</h2><p>You can close this tab and return to Reqly.</p></body></html>');
          clearTimeout(timeout);
          server.close();
          resolve(code);
        });

        server.listen(callbackPort);
      });

      // Open browser
      const { exec } = await import('child_process');
      const openCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      exec(`${openCmd} "${fullAuthUrl}"`);

      // Notify caller that flow has started
      res.json({ status: 'browser_opened', authUrl: fullAuthUrl });

      // Exchange code for tokens in background; update profile when done
      codePromise.then(async (code) => {
        const body = new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: callbackUri,
          client_id: clientId,
          code_verifier: codeVerifier,
          ...(clientSecret ? { client_secret: clientSecret } : {}),
        });

        const { fetch: undiciFetch } = await import('undici');
        const tokenRes = await undiciFetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });

        if (!tokenRes.ok) {
          console.error(`[OAuth2] Token exchange failed: ${tokenRes.status}`);
          return;
        }

        const data: any = await tokenRes.json();
        const expiresAt = data.expires_in ? String(Date.now() + Number(data.expires_in) * 1000) : undefined;

        await context.authManager.updateProfile(profile.id, {
          credentials: {
            ...profile.credentials,
            accessToken: data.access_token,
            ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
            ...(expiresAt ? { expiresAt } : {}),
          },
        });
        console.error(`[OAuth2] Tokens stored for profile "${profile.name}"`);
      }).catch(e => {
        console.error(`[OAuth2] Authorization failed: ${e.message}`);
      });

    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/environments', async (req, res) => {
    try {
      const envs = await context.environmentManager.listEnvironments();
      const active = await context.environmentManager.getActiveEnvironment();
      res.json({ environments: envs, active: active?.name });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/environments/active', async (req, res) => {
    try {
      await context.environmentManager.setActiveEnvironment(req.body.name);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/environments', async (req, res) => {
    try {
      await context.environmentManager.createEnvironment(req.body.name, req.body.variables || {});
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/environments/:name', async (req, res) => {
    try {
      await context.environmentManager.updateEnvironment(req.params.name, req.body.variables || {});
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/environments/:name', async (req, res) => {
    try {
      await context.environmentManager.deleteEnvironment(req.params.name);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Export environment as Postman JSON (triggers download in browser)
  app.get('/api/environments/:name/export', async (req, res) => {
    try {
      const json = await context.environmentManager.exportEnvironmentToPostman(req.params.name);
      const filename = `${req.params.name}.postman_environment.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(json);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Import environment from Postman JSON
  app.post('/api/environments/import', async (req, res) => {
    try {
      const { content, nameOverride } = req.body as { content: string; nameOverride?: string };
      if (!content) return res.status(400).json({ error: 'content is required' }) as any;
      const env = await context.environmentManager.importEnvironmentFromPostman(content, nameOverride);
      res.json({ success: true, name: env.name, variableCount: Object.keys(env.variables).length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Collection example responses
  app.post('/api/collections/:col/requests/:req/examples', async (req, res) => {
    try {
      const { exampleName, status, body, headers, latency } = req.body;
      const saved = await context.collectionManager.saveExample(req.params.col, req.params.req, {
        name: exampleName,
        status,
        body: body ?? null,
        headers: headers || {},
        latency: latency || 0,
      });
      res.json(saved);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/collections/:col/requests/:req/examples', async (req, res) => {
    try {
      const examples = await context.collectionManager.listExamples(req.params.col, req.params.req);
      res.json(examples);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/switch-project', async (req, res) => {
    try {
      const projectDir: string = req.body.projectDir;
      if (!projectDir) {
        res.status(400).json({ error: 'projectDir is required' });
        return;
      }
      const collectionsDir = path.join(projectDir, '.reqly');
      const environmentsPath = path.join(collectionsDir, 'environments.yaml');

      context.collectionManager = new CollectionManager(collectionsDir);
      context.environmentManager = new EnvironmentManager(environmentsPath);

      const lock = await readLock();
      await writeLock(projectDir, lock?.port || port);

      res.json({ ok: true, projectDir });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/shutdown', async (req, res) => {
    res.json({ ok: true });
    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 50);
  });

  app.get('/api/history', (req, res) => {
    res.json(context.historyStore.list());
  });

  app.delete('/api/history', (req, res) => {
    context.historyStore.clear();
    res.json({ success: true });
  });

  const globalConfigPath = path.join(os.homedir(), '.reqly', 'config.json');

  app.post('/api/run/collection', async (req, res) => {
    try {
      let env = undefined;
      if (req.body.environmentName) {
        const envs = await context.environmentManager.listEnvironments();
        env = envs.find((e: any) => e.name === req.body.environmentName);
      } else {
        env = await context.environmentManager.getActiveEnvironment() || undefined;
      }
      
      const { CollectionRunner } = await import('../engine/collection-runner.js');
      const runner = new CollectionRunner(context);
      const result = await runner.run(req.body.collectionName, { 
        stopOnFailure: req.body.stopOnFailure,
        environment: env
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/run/adhoc', async (req, res) => {
    try {
      let env = undefined;
      if (req.body.environmentName) {
        const envs = await context.environmentManager.listEnvironments();
        env = envs.find((e: any) => e.name === req.body.environmentName);
      } else {
        env = await context.environmentManager.getActiveEnvironment() || undefined;
      }
      
      let auth = undefined;
      if (req.body.request.authProfileId) {
        auth = await context.authManager.getProfile(req.body.request.authProfileId);
        // Auto-refresh OAuth2 token if expired or expiring within 60 seconds
        if (auth.type === 'oauth2' && auth.credentials.refreshToken) {
          const expiresAt = Number(auth.credentials.expiresAt || 0);
          if (!expiresAt || Date.now() > expiresAt - 60_000) {
            try {
              auth = await context.authManager.refreshOAuth2Token(auth.id);
            } catch (e: any) {
              console.error(`[OAuth2] Auto-refresh failed: ${e.message}`);
            }
          }
        }
      }

      // Add responseStore to request config substitute call before execution
      // Wait, we need to substitute config using responseStore
      const { substituteConfig } = await import('../engine/variable-substitutor.js');
      const vars = env ? env.variables : {};
      const config = substituteConfig(req.body.request, vars, context.responseStore);

      const response = await context.executeRequest(config, env, auth);
      context.responseStore.set(req.body.request.name, response);
      context.historyStore.append(req.body.request, response);

      // Compute diff against previous run
      let diff = undefined;
      const lastTwo = context.historyStore.getLastTwo(req.body.request.name);
      if (lastTwo.length === 2) {
        const { diffResponses } = await import('../engine/response-differ.js');
        diff = diffResponses(lastTwo[1], lastTwo[0]);
      }
      
      const { runAssertions } = await import('../engine/assertion-runner.js');
      let assertions: any[] = [];
      if (req.body.request.assertions) {
        assertions = runAssertions(response, req.body.request.assertions);
      }

      res.json({ response, assertions, diff });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/config', async (req, res) => {
    try {
      const data = await fs.readFile(globalConfigPath, 'utf-8');
      res.json(JSON.parse(data));
    } catch (e: any) {
      if (e.code === 'ENOENT') res.json({});
      else res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/config', async (req, res) => {
    try {
      let currentConfig = {};
      try {
        const data = await fs.readFile(globalConfigPath, 'utf-8');
        currentConfig = JSON.parse(data);
      } catch (e: any) {}
      
      const newConfig = { ...currentConfig, ...req.body };
      await fs.writeFile(globalConfigPath, JSON.stringify(newConfig, null, 2));
      res.json(newConfig);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/collections/:name/export', async (req, res) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const format = (req.query.format as string) || 'postman';
      if (!['postman', 'openapi'].includes(format)) {
        return res.status(400).json({ error: 'format must be "postman" or "openapi"' });
      }
      const collection = await context.collectionManager.getCollection(name);
      const content = format === 'openapi' ? exportToOpenApi(collection) : exportToPostman(collection);
      const ext = format === 'openapi' ? 'json' : 'json';
      const filename = `${name.replace(/[^a-zA-Z0-9-_]/g, '_')}_${format}.${ext}`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/import/curl', (req, res) => {
    try {
      const { curl } = req.body as { curl: string };
      if (!curl) return res.status(400).json({ error: 'curl field required' });
      const parsed = parseCurl(curl);
      res.json({ request: parsed });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/codegen', (req, res) => {
    try {
      const { request, target } = req.body as { request: any; target: 'curl' | 'fetch' | 'axios' };
      if (!request || !target) return res.status(400).json({ error: 'request and target fields required' });
      const code = generateCode(request, target);
      res.json({ code });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  const packageRoot = path.resolve(__dirname, '..', '..');
  let uiBuildPath = path.join(packageRoot, 'dist', 'ui');
  if (!fsSync.existsSync(uiBuildPath)) {
    uiBuildPath = path.join(packageRoot, 'src', 'ui', 'dist');
  }
  app.use(express.static(uiBuildPath));

  app.use((req, res) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      res.sendFile(path.join(uiBuildPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  return app.listen(port, () => {
    console.error(`Reqly Express server listening on http://localhost:${port}`);
  });
}
