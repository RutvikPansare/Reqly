import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EnvironmentManager } from './environment-manager.js';

describe('EnvironmentManager', () => {
  let tmpFile: string;
  let manager: EnvironmentManager;

  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-env-test-'));
    tmpFile = path.join(tmpDir, 'environments.yaml');
    manager = new EnvironmentManager(tmpFile);
  });

  afterEach(() => {
    fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
  });

  it('should create and get an environment', async () => {
    const env = await manager.createEnvironment('dev', { host: 'localhost' });
    expect(env.name).toBe('dev');
    expect(env.variables).toEqual({ host: 'localhost' });

    const retrieved = await manager.getEnvironment('dev');
    expect(retrieved.name).toBe('dev');
    expect(retrieved.variables).toEqual({ host: 'localhost' });
  });

  it('should list environments', async () => {
    await manager.createEnvironment('dev', {});
    await manager.createEnvironment('prod', {});

    const envs = await manager.listEnvironments();
    expect(envs).toHaveLength(2);
    expect(envs.map(e => e.name).sort()).toEqual(['dev', 'prod']);
  });

  it('should set and get active environment', async () => {
    await manager.createEnvironment('dev', { a: '1' });
    
    let active = await manager.getActiveEnvironment();
    expect(active).toBeNull();

    await manager.setActiveEnvironment('dev');
    active = await manager.getActiveEnvironment();
    expect(active?.name).toBe('dev');
  });

  it('should update variable in environment', async () => {
    await manager.createEnvironment('dev', { a: '1' });
    await manager.updateVariable('dev', 'a', '2');
    await manager.updateVariable('dev', 'b', '3');

    const env = await manager.getEnvironment('dev');
    expect(env.variables).toEqual({ a: '2', b: '3' });
  });

  it('should throw if getting missing environment', async () => {
    await expect(manager.getEnvironment('missing')).rejects.toThrow();
  });

  it('should delete an environment', async () => {
    await manager.createEnvironment('dev', {});
    await manager.createEnvironment('prod', {});

    await manager.deleteEnvironment('dev');

    const envs = await manager.listEnvironments();
    expect(envs.map(e => e.name)).toEqual(['prod']);
  });

  it('should throw if deleting a missing environment', async () => {
    await expect(manager.deleteEnvironment('missing')).rejects.toThrow();
  });

  it('should clear active when deleting the active environment', async () => {
    await manager.createEnvironment('dev', {});
    await manager.setActiveEnvironment('dev');

    await manager.deleteEnvironment('dev');

    expect(await manager.getActiveEnvironment()).toBeNull();
  });

  describe('import/export (Postman format)', () => {
    const postmanEnv = {
      id: 'abc-123',
      name: 'Staging',
      _postman_variable_scope: 'environment',
      values: [
        { key: 'baseUrl', value: 'https://staging.api.example.com', enabled: true },
        { key: 'apiKey', value: 'staging-key', enabled: true },
        { key: 'disabled', value: 'ignored', enabled: false },
      ],
    };

    it('should import a Postman environment JSON and create the environment', async () => {
      const env = await manager.importEnvironmentFromPostman(JSON.stringify(postmanEnv));
      expect(env.name).toBe('Staging');
      expect(env.variables['baseUrl']).toBe('https://staging.api.example.com');
      expect(env.variables['apiKey']).toBe('staging-key');
      // disabled vars are skipped
      expect(env.variables['disabled']).toBeUndefined();
    });

    it('should import with a name override', async () => {
      const env = await manager.importEnvironmentFromPostman(JSON.stringify(postmanEnv), 'Override Name');
      expect(env.name).toBe('Override Name');
    });

    it('should update an existing environment if name already exists on import', async () => {
      await manager.createEnvironment('Staging', { old: 'value' });
      const env = await manager.importEnvironmentFromPostman(JSON.stringify(postmanEnv));
      expect(env.name).toBe('Staging');
      expect(env.variables['baseUrl']).toBe('https://staging.api.example.com');
      expect(env.variables['old']).toBeUndefined();
    });

    it('should throw on invalid JSON', async () => {
      await expect(manager.importEnvironmentFromPostman('not json')).rejects.toThrow('Invalid environment JSON');
    });

    it('should throw when values array is missing', async () => {
      await expect(manager.importEnvironmentFromPostman(JSON.stringify({ name: 'X' }))).rejects.toThrow('values');
    });

    it('should export an environment as Postman JSON', async () => {
      await manager.createEnvironment('Production', { host: 'prod.api.com', token: 'abc' });
      const json = await manager.exportEnvironmentToPostman('Production');
      const parsed = JSON.parse(json);

      expect(parsed.name).toBe('Production');
      expect(parsed._postman_variable_scope).toBe('environment');
      expect(Array.isArray(parsed.values)).toBe(true);
      const keys = parsed.values.map((v: any) => v.key);
      expect(keys).toContain('host');
      expect(keys).toContain('token');
      const hostEntry = parsed.values.find((v: any) => v.key === 'host');
      expect(hostEntry.value).toBe('prod.api.com');
      expect(hostEntry.enabled).toBe(true);
    });

    it('should throw when exporting a missing environment', async () => {
      await expect(manager.exportEnvironmentToPostman('nonexistent')).rejects.toThrow('not found');
    });
  });
});
