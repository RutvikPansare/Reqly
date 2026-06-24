import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { load, dump } from 'js-yaml';
import { Environment, EnvironmentStore } from '../types/index.js';

export class EnvironmentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentNotFoundError';
  }
}

export class EnvironmentManager {
  constructor(private configPath: string) {}

  private async loadStore(): Promise<EnvironmentStore> {
    if (!existsSync(this.configPath)) {
      return { environments: [] };
    }
    const content = await fs.readFile(this.configPath, 'utf8');
    try {
      const store = load(content) as EnvironmentStore;
      return store || { environments: [] };
    } catch {
      return { environments: [] };
    }
  }

  private async saveStore(store: EnvironmentStore): Promise<void> {
    const dir = path.dirname(this.configPath);
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
    const content = dump(store);
    await fs.writeFile(this.configPath, content, 'utf8');
  }

  async createEnvironment(name: string, variables: Record<string, string>): Promise<Environment> {
    const store = await this.loadStore();
    const existing = store.environments.find(e => e.name === name);
    if (existing) {
      throw new Error(`Environment ${name} already exists`);
    }

    const env: Environment = {
      id: `env-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      variables,
    };

    store.environments.push(env);
    await this.saveStore(store);
    return env;
  }

  async getEnvironment(name: string): Promise<Environment> {
    const store = await this.loadStore();
    const env = store.environments.find(e => e.name === name);
    if (!env) {
      throw new EnvironmentNotFoundError(`Environment ${name} not found`);
    }
    return env;
  }

  async listEnvironments(): Promise<Environment[]> {
    const store = await this.loadStore();
    return store.environments;
  }

  async setActiveEnvironment(name: string): Promise<void> {
    const store = await this.loadStore();
    const env = store.environments.find(e => e.name === name);
    if (!env) {
      throw new EnvironmentNotFoundError(`Environment ${name} not found`);
    }
    store.active = name;
    await this.saveStore(store);
  }

  async getActiveEnvironment(): Promise<Environment | null> {
    const store = await this.loadStore();
    if (!store.active) {
      return null;
    }
    const env = store.environments.find(e => e.name === store.active);
    return env || null;
  }

  async updateVariable(envName: string, key: string, value: string): Promise<void> {
    const store = await this.loadStore();
    const env = store.environments.find(e => e.name === envName);
    if (!env) {
      throw new EnvironmentNotFoundError(`Environment ${envName} not found`);
    }
    
    env.variables[key] = value;
    await this.saveStore(store);
  }

  async updateEnvironment(name: string, variables: Record<string, string>): Promise<void> {
    const store = await this.loadStore();
    const env = store.environments.find(e => e.name === name);
    if (!env) {
      throw new EnvironmentNotFoundError(`Environment ${name} not found`);
    }

    env.variables = variables;
    await this.saveStore(store);
  }

  async deleteEnvironment(name: string): Promise<void> {
    const store = await this.loadStore();
    const exists = store.environments.some(e => e.name === name);
    if (!exists) {
      throw new EnvironmentNotFoundError(`Environment ${name} not found`);
    }

    store.environments = store.environments.filter(e => e.name !== name);
    // Clear the active pointer if it referenced the deleted environment.
    if (store.active === name) {
      delete store.active;
    }
    await this.saveStore(store);
  }
}
