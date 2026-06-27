import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { CollectionManager } from '../engine/collection-manager.js';
import { FlowManager } from '../engine/flow-manager.js';
import { EnvironmentManager } from '../engine/environment-manager.js';
import { defaultStarterDir } from './init-command.js';

describe('reqly-starter example collection', () => {
  it('is valid and parseable by the engine managers', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reqly-starter-test-'));
    const reqlyDir = path.join(tmpDir, '.reqly');
    await fs.cp(defaultStarterDir(), reqlyDir, { recursive: true });

    const collectionManager = new CollectionManager(reqlyDir);
    const collections = await collectionManager.listCollections();
    expect(collections.map((c: any) => c.name)).toContain('jsonplaceholder');

    const collection = await collectionManager.getCollection('jsonplaceholder');
    const names = collection.requests.map((r: any) => r.name);
    expect(names).toEqual(expect.arrayContaining(['get-todo', 'create-todo', 'get-user', 'list-todos']));

    const flowManager = new FlowManager(reqlyDir);
    const flows = await flowManager.listFlows();
    expect(flows.map((f: any) => f.name)).toContain('starter-flow');
    const flow = await flowManager.getFlow('starter-flow');
    expect(flow.steps.length).toBeGreaterThan(0);

    const environmentManager = new EnvironmentManager(path.join(reqlyDir, 'environments.yaml'));
    const envs = await environmentManager.listEnvironments();
    expect(envs.some((e: any) => e.name === 'default')).toBe(true);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
