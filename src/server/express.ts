import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { EngineContext } from '../mcp/tools/types.js';
import { fileURLToPath } from 'url';

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

  app.get('/api/collections', async (req, res) => {
    try {
      const cols = await context.collectionManager.listCollections();
      res.json(cols);
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
      }

      // Add responseStore to request config substitute call before execution
      // Wait, we need to substitute config using responseStore
      const { substituteConfig } = await import('../engine/variable-substitutor.js');
      const vars = env ? env.variables : {};
      const config = substituteConfig(req.body.request, vars, context.responseStore);

      const response = await context.executeRequest(config, env, auth);
      context.responseStore.set(req.body.request.name, response);
      context.historyStore.append(req.body.request, response);
      
      const { runAssertions } = await import('../engine/assertion-runner.js');
      let assertions: any[] = [];
      if (req.body.request.assertions) {
        assertions = runAssertions(response, req.body.request.assertions);
      }

      res.json({ response, assertions });
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

  const packageRoot = path.resolve(__dirname, '..', '..');
  const uiBuildPath = path.join(packageRoot, 'src', 'ui', 'dist');
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
