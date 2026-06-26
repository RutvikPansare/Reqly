import { describe, it, expect, vi } from 'vitest';
import * as createFlow from './create-flow.js';
import * as getFlow from './get-flow.js';
import * as listFlows from './list-flows.js';
import * as deleteFlow from './delete-flow.js';

describe('create_flow', () => {
  it('has the correct definition', () => {
    expect(createFlow.definition.name).toBe('create_flow');
    expect(createFlow.definition.inputSchema.required).toContain('name');
  });

  it('creates a flow and returns it', async () => {
    const flow = { name: 'Login Flow', steps: [] };
    const ctx: any = { flowManager: { createFlow: vi.fn().mockResolvedValue(flow) } };
    const res = await createFlow.handler({ name: 'Login Flow' }, ctx);
    expect(ctx.flowManager.createFlow).toHaveBeenCalledWith('Login Flow', undefined);
    expect(JSON.parse(res.content[0].text)).toEqual(flow);
    expect(res.isError).toBeFalsy();
  });

  it('returns isError on failure', async () => {
    const ctx: any = { flowManager: { createFlow: vi.fn().mockRejectedValue(new Error('boom')) } };
    const res = await createFlow.handler({ name: 'X' }, ctx);
    expect(res.isError).toBe(true);
  });
});

describe('get_flow', () => {
  it('has the correct definition', () => {
    expect(getFlow.definition.name).toBe('get_flow');
    expect(getFlow.definition.inputSchema.required).toContain('name');
  });

  it('returns the flow', async () => {
    const flow = { name: 'F', steps: [] };
    const ctx: any = { flowManager: { getFlow: vi.fn().mockResolvedValue(flow) } };
    const res = await getFlow.handler({ name: 'F' }, ctx);
    expect(JSON.parse(res.content[0].text)).toEqual(flow);
  });

  it('returns isError when missing', async () => {
    const ctx: any = { flowManager: { getFlow: vi.fn().mockRejectedValue(new Error('Flow F not found')) } };
    const res = await getFlow.handler({ name: 'F' }, ctx);
    expect(res.isError).toBe(true);
  });
});

describe('list_flows', () => {
  it('has the correct definition', () => {
    expect(listFlows.definition.name).toBe('list_flows');
  });

  it('returns all flows', async () => {
    const flows = [{ name: 'A', steps: [] }, { name: 'B', steps: [] }];
    const ctx: any = { flowManager: { listFlows: vi.fn().mockResolvedValue(flows) } };
    const res = await listFlows.handler({}, ctx);
    expect(JSON.parse(res.content[0].text)).toEqual(flows);
  });
});

describe('delete_flow', () => {
  it('has the correct definition', () => {
    expect(deleteFlow.definition.name).toBe('delete_flow');
    expect(deleteFlow.definition.inputSchema.required).toContain('name');
  });

  it('deletes the flow', async () => {
    const ctx: any = { flowManager: { deleteFlow: vi.fn().mockResolvedValue(undefined) } };
    const res = await deleteFlow.handler({ name: 'F' }, ctx);
    expect(ctx.flowManager.deleteFlow).toHaveBeenCalledWith('F');
    expect(JSON.parse(res.content[0].text)).toEqual({ success: true });
  });

  it('returns isError when missing', async () => {
    const ctx: any = { flowManager: { deleteFlow: vi.fn().mockRejectedValue(new Error('Flow F not found')) } };
    const res = await deleteFlow.handler({ name: 'F' }, ctx);
    expect(res.isError).toBe(true);
  });
});
