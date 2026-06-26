import { describe, it, expect, vi } from 'vitest';
import * as runFlow from './run-flow.js';

describe('run_flow', () => {
  it('has the correct definition', () => {
    expect(runFlow.definition.name).toBe('run_flow');
    expect(runFlow.definition.inputSchema.required).toEqual(['name']);
  });

  it('runs the flow and returns the structured FlowRunResult', async () => {
    const flow = { name: 'F', steps: [] };
    const ctx: any = { flowManager: { getFlow: vi.fn().mockResolvedValue(flow) } };

    const res = await runFlow.handler({ name: 'F' }, ctx);
    const parsed = JSON.parse(res.content[0].text);
    expect(ctx.flowManager.getFlow).toHaveBeenCalledWith('F');
    expect(parsed.flowName).toBe('F');
    expect(parsed.passed).toBe(true);
    expect(parsed.steps).toEqual([]);
  });

  it('passes dataRow through as a run option', async () => {
    const flow = { name: 'F', steps: [], data: [{ x: '1' }] };
    const ctx: any = { flowManager: { getFlow: vi.fn().mockResolvedValue(flow) } };

    const res = await runFlow.handler({ name: 'F', dataRow: { x: '99' } }, ctx);
    const parsed = JSON.parse(res.content[0].text);
    // With a dataRow override, the result is a single run (no dataRows array).
    expect(parsed.flowName).toBe('F');
    expect(parsed.dataRows).toBeUndefined();
  });

  it('returns isError when the flow is missing', async () => {
    const ctx: any = { flowManager: { getFlow: vi.fn().mockRejectedValue(new Error('Flow F not found')) } };
    const res = await runFlow.handler({ name: 'F' }, ctx);
    expect(res.isError).toBe(true);
  });
});
