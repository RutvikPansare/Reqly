import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { EngineContext } from '../mcp/tools/types.js';

export function startExpressServer(context: EngineContext, port: number = 4242) {
  const app = express();
  app.use(cors());
  app.use(express.json());

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

  const globalConfigPath = path.join(os.homedir(), '.reqly', 'config.json');

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

  // Serve static UI build
  const uiBuildPath = path.join(process.cwd(), 'src', 'ui', 'dist');
  app.use(express.static(uiBuildPath));

  app.get('*', (req, res) => {
    res.sendFile(path.join(uiBuildPath, 'index.html'));
  });

  app.listen(port, () => {
    console.error(`Reqly Express server listening on http://localhost:${port}`);
  });
}
