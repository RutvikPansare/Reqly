import { describe, it, expect, vi } from 'vitest';
import * as addFlowStep from './add-flow-step.js';
import * as updateFlowStep from './update-flow-step.js';
import * as deleteFlowStep from './delete-flow-step.js';

const step = { type: 'run', id: 's1', collection: 'Auth', request: 'Login' };

describe('add_flow_step', () => {
  it('has the correct definition', () => {
    expect(addFlowStep.definition.name).toBe('add_flow_step');
    expect(addFlowStep.definition.inputSchema.required).toEqual(['flowName', 'step']);
  });

  it('adds the step', async () => {
    const ctx: any = { flowManager: { addFlowStep: vi.fn().mockResolvedValue(undefined) } };
    const res = await addFlowStep.handler({ flowName: 'F', step }, ctx);
    expect(ctx.flowManager.addFlowStep).toHaveBeenCalledWith('F', step);
    expect(JSON.parse(res.content[0].text)).toEqual({ success: true });
  });

  it('returns isError on failure', async () => {
    const ctx: any = { flowManager: { addFlowStep: vi.fn().mockRejectedValue(new Error('Flow F not found')) } };
    const res = await addFlowStep.handler({ flowName: 'F', step }, ctx);
    expect(res.isError).toBe(true);
  });
});

describe('update_flow_step', () => {
  it('has the correct definition', () => {
    expect(updateFlowStep.definition.name).toBe('update_flow_step');
    expect(updateFlowStep.definition.inputSchema.required).toEqual(['flowName', 'stepId', 'step']);
  });

  it('updates the step', async () => {
    const ctx: any = { flowManager: { updateFlowStep: vi.fn().mockResolvedValue(undefined) } };
    const res = await updateFlowStep.handler({ flowName: 'F', stepId: 's1', step }, ctx);
    expect(ctx.flowManager.updateFlowStep).toHaveBeenCalledWith('F', 's1', step);
    expect(JSON.parse(res.content[0].text)).toEqual({ success: true });
  });

  it('returns isError when step is missing', async () => {
    const ctx: any = { flowManager: { updateFlowStep: vi.fn().mockRejectedValue(new Error('Step s1 not found')) } };
    const res = await updateFlowStep.handler({ flowName: 'F', stepId: 's1', step }, ctx);
    expect(res.isError).toBe(true);
  });
});

describe('delete_flow_step', () => {
  it('has the correct definition', () => {
    expect(deleteFlowStep.definition.name).toBe('delete_flow_step');
    expect(deleteFlowStep.definition.inputSchema.required).toEqual(['flowName', 'stepId']);
  });

  it('deletes the step', async () => {
    const ctx: any = { flowManager: { deleteFlowStep: vi.fn().mockResolvedValue(undefined) } };
    const res = await deleteFlowStep.handler({ flowName: 'F', stepId: 's1' }, ctx);
    expect(ctx.flowManager.deleteFlowStep).toHaveBeenCalledWith('F', 's1');
    expect(JSON.parse(res.content[0].text)).toEqual({ success: true });
  });

  it('returns isError when step is missing', async () => {
    const ctx: any = { flowManager: { deleteFlowStep: vi.fn().mockRejectedValue(new Error('Step s1 not found')) } };
    const res = await deleteFlowStep.handler({ flowName: 'F', stepId: 's1' }, ctx);
    expect(res.isError).toBe(true);
  });
});
