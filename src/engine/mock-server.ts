import express from 'express';
import { Server } from 'http';
import { CollectionManager } from './collection-manager.js';
import { resolveMockPath } from './mock-path-resolver.js';

export interface MockRoute {
  method: string;
  path: string;
  exampleCount: number;
}

export interface MockStatus {
  running: boolean;
  collection?: string;
  port?: number;
  routes: MockRoute[];
}

// Response headers from a saved example that must not be copied verbatim -
// they describe the original transfer encoding/length and would corrupt the
// mocked response (Express sets correct values when sending the body).
const SKIP_HEADERS = new Set(['content-length', 'content-encoding', 'transfer-encoding']);

export class MockServer {
  private server: Server | null = null;
  private collection: string | null = null;
  private port: number | null = null;
  private routes: MockRoute[] = [];

  constructor(private collectionManager: CollectionManager) {}

  async start(collectionName: string, port: number): Promise<void> {
    if (this.server) {
      throw new Error('Mock server is already running');
    }

    const collection = await this.collectionManager.getCollection(collectionName);
    const app = express();

    // Permissive CORS so browser apps can hit the mock with no proxy config.
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', '*');
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });

    this.routes = [];
    for (const reqDef of collection.requests) {
      if (!reqDef.examples || reqDef.examples.length === 0) continue;

      const routePath = resolveMockPath(reqDef);
      const method = (reqDef.method || 'GET').toLowerCase();
      const examples = reqDef.examples;

      this.routes.push({ method: (reqDef.method || 'GET').toUpperCase(), path: routePath, exampleCount: examples.length });

      (app as any)[method](routePath, (req: express.Request, res: express.Response) => {
        let example = examples[0];
        const wanted = req.header('X-Reqly-Example');
        if (wanted) {
          const found = examples.find(e => e.name === wanted);
          if (found) example = found;
        }

        for (const [k, v] of Object.entries(example.headers || {})) {
          if (SKIP_HEADERS.has(k.toLowerCase())) continue;
          res.setHeader(k, v as string);
        }

        res.status(example.status).send(example.body as any);
      });
    }

    // Unmatched routes: helpful 404 listing what the mock does serve.
    app.use((req: express.Request, res: express.Response) => {
      res.status(404).json({
        error: `No example found for ${req.method} ${req.path} in collection '${collectionName}'`,
        availableRoutes: this.routes.map(r => `${r.method} ${r.path}`),
      });
    });

    await new Promise<void>((resolve) => {
      this.server = app.listen(port, () => resolve());
    });
    this.collection = collectionName;
    this.port = port;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server!.close(err => (err ? reject(err) : resolve()));
    });
    this.server = null;
    this.collection = null;
    this.port = null;
    this.routes = [];
  }

  getStatus(): MockStatus {
    return {
      running: this.server !== null,
      ...(this.collection ? { collection: this.collection } : {}),
      ...(this.port !== null ? { port: this.port } : {}),
      routes: this.routes,
    };
  }
}
