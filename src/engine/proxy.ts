import * as http from 'http';
import * as net from 'net';
import { CollectionManager } from './collection-manager.js';
import { CollectionRequest } from '../types/index.js';

export interface ProxyConfig {
  port: number;
  collectionName: string;
  ignoreHosts?: string[];
}

export class ProxyServer {
  private server: http.Server | null = null;
  private collectionManager: CollectionManager;

  constructor(collectionManager: CollectionManager) {
    this.collectionManager = collectionManager;
  }

  public async start(config: ProxyConfig): Promise<void> {
    if (this.server) {
      throw new Error('Proxy server is already running');
    }

    const ignoreHosts = config.ignoreHosts || ['localhost', '127.0.0.1'];

    this.server = http.createServer((req, res) => {
      this.handleHttpRequest(req, res, config.collectionName, ignoreHosts);
    });

    this.server.on('connect', (req, clientSocket, head) => {
      this.handleConnectRequest(req, clientSocket as net.Socket, head);
    });

    return new Promise((resolve) => {
      this.server!.listen(config.port, () => {
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        this.server = null;
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private handleConnectRequest(req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) {
    const { port, hostname } = new URL(`http://${req.url}`);
    const serverSocket = net.connect(Number(port) || 80, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\\r\\n' +
        'Proxy-agent: Node.js-Proxy\\r\\n' +
        '\\r\\n');
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', () => {
      clientSocket.end();
    });

    clientSocket.on('error', () => {
      serverSocket.end();
    });
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse, collectionName: string, ignoreHosts: string[]) {
    const start = Date.now();
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    
    if (ignoreHosts.includes(url.hostname)) {
      this.proxyRequest(req, res, url);
      return;
    }

    let reqBody = '';
    req.on('data', chunk => reqBody += chunk);

    req.on('end', () => {
      // Capture response
      const proxyReq = http.request({
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: req.method,
        headers: req.headers
      }, (proxyRes) => {
        let resBody = '';
        proxyRes.on('data', chunk => resBody += chunk);
        
        proxyRes.on('end', async () => {
          const latency = Date.now() - start;
          
          try {
            await this.captureRequest(collectionName, {
              id: Date.now().toString(),
              method: (req.method || 'GET') as any,
              url: url.toString(),
              headers: req.headers as Record<string, string>,
              body: reqBody
            });
          } catch (e) {
            console.error('Failed to capture request', e);
          }
          
          res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
          res.end(resBody);
        });
      });

      proxyReq.on('error', (err) => {
        res.writeHead(500);
        res.end(err.message);
      });

      if (reqBody) proxyReq.write(reqBody);
      proxyReq.end();
    });
  }

  private proxyRequest(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    const proxyReq = http.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: req.method,
      headers: req.headers
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
    });
    
    proxyReq.on('error', (err) => {
      res.writeHead(500);
      res.end();
    });
    
    req.pipe(proxyReq);
  }

  private async captureRequest(collectionName: string, config: Omit<CollectionRequest, 'name'>) {
    try {
      await this.collectionManager.getCollection(collectionName);
    } catch (e) {
      await this.collectionManager.createCollection(collectionName);
    }

    // Dedup logic: Check if identical method+URL exists
    const collection = await this.collectionManager.getCollection(collectionName);
    const existing = collection.requests.find(r => r.method === config.method && r.url === config.url);
    if (existing) {
      return; // Skip duplicates
    }

    const name = `${config.method} ${new URL(config.url).pathname}`.replace(/[^a-zA-Z0-9- ]/g, '').trim().substring(0, 30);
    const uniqueName = `${name} ${Date.now()}`;

    await this.collectionManager.addRequest(collectionName, {
      ...config,
      name: uniqueName
    });
  }
}
