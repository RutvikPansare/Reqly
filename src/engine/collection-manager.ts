import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { load, dump } from 'js-yaml';
import { Collection, CollectionRequest, ExampleResponse, CollectionMeta, CollectionAuth, CollectionSpec } from '../types/index.js';

// Reserved filename for collection-level metadata (variables, description).
// It lives alongside request files inside the collection folder but is never
// treated as a request.
const META_FILE = 'collection.yaml';

// Top-level directories reserved by other managers sharing the same .reqly
// base dir (e.g. FlowManager's `flows/`, proto files for gRPC) - never treated as collections.
const RESERVED_DIRS = new Set(['flows', 'protos', '.schema-cache']);

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
      if (file === META_FILE) continue; // metadata, not a request
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

    const meta = await this.readMeta(name);
    return {
      name,
      requests,
      ...(meta.variables ? { variables: meta.variables } : {}),
      ...(meta.description ? { description: meta.description } : {}),
      ...(meta.auth ? { auth: meta.auth } : {}),
      ...(meta.spec ? { spec: meta.spec } : {}),
    };
  }

  private async readMeta(collectionName: string): Promise<CollectionMeta> {
    const metaPath = path.join(this.baseDir, collectionName, META_FILE);
    if (!existsSync(metaPath)) return {};
    try {
      const content = await fs.readFile(metaPath, 'utf8');
      return (load(content) as CollectionMeta) || {};
    } catch {
      return {};
    }
  }

  private async writeMeta(collectionName: string, meta: CollectionMeta): Promise<void> {
    const colPath = path.join(this.baseDir, collectionName);
    if (!existsSync(colPath)) {
      throw new CollectionNotFoundError(`Collection ${collectionName} not found`);
    }
    const metaPath = path.join(colPath, META_FILE);
    await fs.writeFile(metaPath, dump(meta), 'utf8');
  }

  async getCollectionVariables(collectionName: string): Promise<Record<string, string>> {
    const meta = await this.readMeta(collectionName);
    return meta.variables || {};
  }

  async setCollectionVariable(collectionName: string, key: string, value: string): Promise<void> {
    const meta = await this.readMeta(collectionName);
    meta.variables = { ...(meta.variables || {}), [key]: value };
    await this.writeMeta(collectionName, meta);
  }

  async deleteCollectionVariable(collectionName: string, key: string): Promise<void> {
    const meta = await this.readMeta(collectionName);
    if (meta.variables) {
      delete meta.variables[key];
    }
    await this.writeMeta(collectionName, meta);
  }

  async getCollectionAuth(collectionName: string): Promise<CollectionAuth | undefined> {
    const meta = await this.readMeta(collectionName);
    return meta.auth;
  }

  async setCollectionAuth(collectionName: string, auth: CollectionAuth): Promise<void> {
    const meta = await this.readMeta(collectionName);
    meta.auth = auth;
    await this.writeMeta(collectionName, meta);
  }

  async deleteCollectionAuth(collectionName: string): Promise<void> {
    const meta = await this.readMeta(collectionName);
    delete meta.auth;
    await this.writeMeta(collectionName, meta);
  }

  async getCollectionSpec(collectionName: string): Promise<CollectionSpec | undefined> {
    const meta = await this.readMeta(collectionName);
    return meta.spec;
  }

  async setCollectionSpec(collectionName: string, spec: CollectionSpec): Promise<void> {
    const meta = await this.readMeta(collectionName);
    meta.spec = spec;
    await this.writeMeta(collectionName, meta);
  }

  async deleteCollectionSpec(collectionName: string): Promise<void> {
    const meta = await this.readMeta(collectionName);
    delete meta.spec;
    await this.writeMeta(collectionName, meta);
  }

  async listCollections(): Promise<Collection[]> {
    await this.ensureBaseDir();
    const cols: Collection[] = [];
    const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !RESERVED_DIRS.has(entry.name)) {
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

    if (`${req.name}.yaml` === META_FILE) {
      throw new Error(`"${req.name}" is a reserved collection metadata name; choose a different request name`);
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

  async duplicateCollection(name: string): Promise<Collection> {
    const srcPath = path.join(this.baseDir, name);
    if (!existsSync(srcPath)) {
      throw new CollectionNotFoundError(`Collection ${name} not found`);
    }

    let copyName = `Copy of ${name}`;
    let suffix = 0;
    while (existsSync(path.join(this.baseDir, copyName))) {
      suffix += 1;
      copyName = `Copy of ${name} (${suffix})`;
    }

    await fs.cp(srcPath, path.join(this.baseDir, copyName), { recursive: true });
    return this.getCollection(copyName);
  }

  async duplicateRequest(collectionName: string, requestName: string, newName: string): Promise<void> {
    const original = await this.getRequest(collectionName, requestName);
    const copy: CollectionRequest = { ...original, name: newName };
    await this.addRequest(collectionName, copy);
  }

  async moveRequest(collectionName: string, requestName: string, targetCollection: string): Promise<{ name: string; collection: string }> {
    const original = await this.getRequest(collectionName, requestName);

    const targetPath = path.join(this.baseDir, targetCollection);
    if (!existsSync(targetPath)) {
      throw new CollectionNotFoundError(`Collection ${targetCollection} not found`);
    }

    let finalName = requestName;
    let suffix = 0;
    while (existsSync(path.join(targetPath, `${finalName}.yaml`))) {
      suffix += 1;
      finalName = `${requestName} (${suffix})`;
    }

    await this.addRequest(targetCollection, { ...original, name: finalName });
    await this.deleteRequest(collectionName, requestName);

    return { name: finalName, collection: targetCollection };
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

  async deleteExample(collectionName: string, requestName: string, exampleId: string): Promise<void> {
    const req = await this.getRequest(collectionName, requestName);
    req.examples = (req.examples || []).filter(e => e.id !== exampleId);
    await this.addRequest(collectionName, req);
  }
}
