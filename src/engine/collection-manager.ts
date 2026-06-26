import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { load, dump } from 'js-yaml';
import { Collection, CollectionRequest, ExampleResponse } from '../types/index.js';

export class CollectionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectionNotFoundError';
  }
}

export class RequestNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestNotFoundError';
  }
}

export class CollectionManager {
  constructor(private baseDir: string) {}

  getBaseDir(): string {
    return this.baseDir;
  }

  private async ensureBaseDir() {
    if (!existsSync(this.baseDir)) {
      await fs.mkdir(this.baseDir, { recursive: true });
    }
  }

  async createCollection(name: string): Promise<Collection> {
    await this.ensureBaseDir();
    const colPath = path.join(this.baseDir, name);
    if (!existsSync(colPath)) {
      await fs.mkdir(colPath, { recursive: true });
    }
    return { name, requests: [] };
  }

  async getCollection(name: string): Promise<Collection> {
    const colPath = path.join(this.baseDir, name);
    if (!existsSync(colPath)) {
      throw new CollectionNotFoundError(`Collection ${name} not found`);
    }

    const requests: CollectionRequest[] = [];
    const files = await fs.readdir(colPath);
    for (const file of files) {
      if (file.endsWith('.yaml')) {
        const filePath = path.join(colPath, file);
        const content = await fs.readFile(filePath, 'utf8');
        try {
          const req = load(content) as CollectionRequest;
          requests.push(req);
        } catch {
          // Ignore invalid yaml files
        }
      }
    }

    return { name, requests };
  }

  async listCollections(): Promise<Collection[]> {
    await this.ensureBaseDir();
    const cols: Collection[] = [];
    const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const col = await this.getCollection(entry.name);
        cols.push(col);
      }
    }
    return cols;
  }

  async addRequest(collectionName: string, req: CollectionRequest): Promise<void> {
    const colPath = path.join(this.baseDir, collectionName);
    if (!existsSync(colPath)) {
      throw new CollectionNotFoundError(`Collection ${collectionName} not found`);
    }

    const filePath = path.join(colPath, `${req.name}.yaml`);
    const content = dump(req);
    await fs.writeFile(filePath, content, 'utf8');
  }

  async getRequest(collectionName: string, requestName: string): Promise<CollectionRequest> {
    const colPath = path.join(this.baseDir, collectionName);
    if (!existsSync(colPath)) {
      throw new CollectionNotFoundError(`Collection ${collectionName} not found`);
    }

    const filePath = path.join(colPath, `${requestName}.yaml`);
    if (!existsSync(filePath)) {
      throw new RequestNotFoundError(`Request ${requestName} not found in collection ${collectionName}`);
    }

    const content = await fs.readFile(filePath, 'utf8');
    return load(content) as CollectionRequest;
  }

  async deleteRequest(collectionName: string, requestName: string): Promise<void> {
    const colPath = path.join(this.baseDir, collectionName);
    if (!existsSync(colPath)) {
      throw new CollectionNotFoundError(`Collection ${collectionName} not found`);
    }

    const filePath = path.join(colPath, `${requestName}.yaml`);
    if (!existsSync(filePath)) {
      throw new RequestNotFoundError(`Request ${requestName} not found in collection ${collectionName}`);
    }

    await fs.unlink(filePath);
  }

  async deleteCollection(name: string): Promise<void> {
    const colPath = path.join(this.baseDir, name);
    if (!existsSync(colPath)) {
      throw new CollectionNotFoundError(`Collection ${name} not found`);
    }
    await fs.rm(colPath, { recursive: true, force: true });
  }

  async renameCollection(oldName: string, newName: string): Promise<void> {
    const oldPath = path.join(this.baseDir, oldName);
    if (!existsSync(oldPath)) {
      throw new CollectionNotFoundError(`Collection ${oldName} not found`);
    }
    const newPath = path.join(this.baseDir, newName);
    // A single atomic rename moves the folder and all its request files.
    await fs.rename(oldPath, newPath);
  }

  async duplicateRequest(collectionName: string, requestName: string, newName: string): Promise<void> {
    const original = await this.getRequest(collectionName, requestName);
    const copy: CollectionRequest = { ...original, name: newName };
    await this.addRequest(collectionName, copy);
  }

  async saveExample(
    collectionName: string,
    requestName: string,
    example: Omit<ExampleResponse, 'id' | 'savedAt'>,
  ): Promise<ExampleResponse> {
    const req = await this.getRequest(collectionName, requestName);
    const newExample: ExampleResponse = {
      ...example,
      id: `ex-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      savedAt: new Date().toISOString(),
    };
    req.examples = [...(req.examples || []), newExample];
    await this.addRequest(collectionName, req);
    return newExample;
  }

  async listExamples(collectionName: string, requestName: string): Promise<ExampleResponse[]> {
    const req = await this.getRequest(collectionName, requestName);
    return req.examples || [];
  }
}
