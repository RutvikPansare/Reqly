import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FlowManager, FlowNotFoundError, FlowStepNotFoundError } from './flow-manager.js';
import { FlowStep } from '../types/index.js';

describe('FlowManager', () => {
  let tmpDir: string;
  let manager: FlowManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-flow-test-'));
    manager = new FlowManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates and gets a flow', async () => {
    const flow = await manager.createFlow('Login Flow', 'Tests login');
    expect(flow.name).toBe('Login Flow');
    expect(flow.description).toBe('Tests login');
    expect(flow.steps).toEqual([]);

    const retrieved = await manager.getFlow('Login Flow');
    expect(retrieved.name).toBe('Login Flow');
    expect(retrieved.steps).toEqual([]);
  });

  it('persists the flow as a YAML file in .reqly/flows/', async () => {
    await manager.createFlow('Login Flow');
    const filePath = path.join(tmpDir, 'flows', 'Login Flow.yaml');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('lists all flows', async () => {
    await manager.createFlow('Flow1');
    await manager.createFlow('Flow2');

    const flows = await manager.listFlows();
    expect(flows.map(f => f.name).sort()).toEqual(['Flow1', 'Flow2']);
  });

  it('throws FlowNotFoundError when getting a missing flow', async () => {
    await expect(manager.getFlow('Missing')).rejects.toThrow(FlowNotFoundError);
  });

  it('deletes a flow', async () => {
    await manager.createFlow('ToDelete');
    await manager.deleteFlow('ToDelete');
    await expect(manager.getFlow('ToDelete')).rejects.toThrow(FlowNotFoundError);
  });

  it('throws FlowNotFoundError when deleting a missing flow', async () => {
    await expect(manager.deleteFlow('Missing')).rejects.toThrow(FlowNotFoundError);
  });

  it('adds a step to a flow', async () => {
    await manager.createFlow('Login Flow');
    const step: FlowStep = { type: 'run', id: 'step1', collection: 'Auth', request: 'Login' };
    await manager.addFlowStep('Login Flow', step);

    const flow = await manager.getFlow('Login Flow');
    expect(flow.steps).toHaveLength(1);
    expect(flow.steps[0]).toEqual(step);
  });

  it('appends subsequent steps in order', async () => {
    await manager.createFlow('Login Flow');
    await manager.addFlowStep('Login Flow', { type: 'run', id: 'step1', collection: 'Auth', request: 'Login' });
    await manager.addFlowStep('Login Flow', { type: 'extract', id: 'step2', from: 'response.body.token', into: 'token' });

    const flow = await manager.getFlow('Login Flow');
    expect(flow.steps.map(s => s.id)).toEqual(['step1', 'step2']);
  });

  it('updates an existing step by id', async () => {
    await manager.createFlow('Login Flow');
    await manager.addFlowStep('Login Flow', { type: 'run', id: 'step1', collection: 'Auth', request: 'Login' });
    await manager.updateFlowStep('Login Flow', 'step1', { type: 'run', id: 'step1', collection: 'Auth', request: 'LoginV2' });

    const flow = await manager.getFlow('Login Flow');
    expect(flow.steps[0]).toEqual({ type: 'run', id: 'step1', collection: 'Auth', request: 'LoginV2' });
  });

  it('throws FlowStepNotFoundError when updating a missing step', async () => {
    await manager.createFlow('Login Flow');
    await expect(
      manager.updateFlowStep('Login Flow', 'missing', { type: 'run', id: 'missing', collection: 'Auth', request: 'Login' })
    ).rejects.toThrow(FlowStepNotFoundError);
  });

  it('deletes a step by id', async () => {
    await manager.createFlow('Login Flow');
    await manager.addFlowStep('Login Flow', { type: 'run', id: 'step1', collection: 'Auth', request: 'Login' });
    await manager.addFlowStep('Login Flow', { type: 'extract', id: 'step2', from: 'response.body.token', into: 'token' });
    await manager.deleteFlowStep('Login Flow', 'step1');

    const flow = await manager.getFlow('Login Flow');
    expect(flow.steps.map(s => s.id)).toEqual(['step2']);
  });

  it('throws FlowStepNotFoundError when deleting a missing step', async () => {
    await manager.createFlow('Login Flow');
    await expect(manager.deleteFlowStep('Login Flow', 'missing')).rejects.toThrow(FlowStepNotFoundError);
  });

  it('stores data rows on the flow', async () => {
    await manager.createFlow('Data Flow');
    await manager.setFlowData('Data Flow', [{ username: 'a' }, { username: 'b' }]);

    const flow = await manager.getFlow('Data Flow');
    expect(flow.data).toEqual([{ username: 'a' }, { username: 'b' }]);
  });

  it('updates a flow description without renaming', async () => {
    await manager.createFlow('Login Flow', 'old description');
    await manager.updateFlowMeta('Login Flow', { description: 'new description' });

    const flow = await manager.getFlow('Login Flow');
    expect(flow.name).toBe('Login Flow');
    expect(flow.description).toBe('new description');
  });

  it('renames a flow, preserving its steps and data', async () => {
    await manager.createFlow('Old Name');
    await manager.addFlowStep('Old Name', { type: 'run', id: 's1', collection: 'Auth', request: 'Login' });

    await manager.updateFlowMeta('Old Name', { name: 'New Name' });

    const flow = await manager.getFlow('New Name');
    expect(flow.name).toBe('New Name');
    expect(flow.steps).toHaveLength(1);
    await expect(manager.getFlow('Old Name')).rejects.toThrow(FlowNotFoundError);
  });

  it('throws FlowNotFoundError when updating meta on a missing flow', async () => {
    await expect(manager.updateFlowMeta('Missing', { description: 'x' })).rejects.toThrow(FlowNotFoundError);
  });
});
