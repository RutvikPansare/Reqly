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
});
