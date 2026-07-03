import { describe, it, expect } from 'vitest';
import { toJUnit, toJUnitFromFlow } from './junit.js';
import { CollectionRunResult } from '../collection-runner.js';
import { FlowRunResult } from '../../types/flow.js';

function baseResult(overrides: Partial<CollectionRunResult> = {}): CollectionRunResult {
  return {
    collection: 'my-collection',
    total: 0,
    passed: 0,
    failed: 0,
    results: [],
    ...overrides
  };
}

describe('toJUnit', () => {
  it('outputs an all-pass suite with one testcase per assertion', () => {
    const result = baseResult({
      total: 1,
      passed: 1,
      failed: 0,
      results: [
        {
          requestName: 'get-todo',
          response: { status: 200, latency: 12.5, headers: {}, body: null } as any,
          assertions: [
            { passed: true, assertion: { field: 'status', operator: 'eq', value: 200 }, actual: 200, message: 'status eq 200' }
          ],
          passed: true,
          duration: 12
        }
      ]
    });

    const xml = toJUnit(result);

    expect(xml).toContain('<testsuite name="my-collection" tests="1" failures="0"');
    expect(xml).toContain('<testcase name="get-todo :: status eq 200" classname="my-collection"');
    expect(xml).not.toContain('<failure');
  });

  it('emits a <failure> element for a failed assertion with the message', () => {
    const result = baseResult({
      total: 1,
      passed: 0,
      failed: 1,
      results: [
        {
          requestName: 'get-todo',
          response: { status: 404, latency: 5, headers: {}, body: null } as any,
          assertions: [
            { passed: false, assertion: { field: 'status', operator: 'eq', value: 200 }, actual: 404, message: 'expected 200, got 404' }
          ],
          passed: false,
          duration: 5
        }
      ]
    });

    const xml = toJUnit(result);

    expect(xml).toContain('<testsuite name="my-collection" tests="1" failures="1"');
    expect(xml).toContain('<failure message="expected 200, got 404">expected 200, got 404</failure>');
  });

  it('emits one testcase per assertion when a request has multiple assertions', () => {
    const result = baseResult({
      total: 1,
      passed: 0,
      failed: 1,
      results: [
        {
          requestName: 'create-todo',
          response: { status: 201, latency: 8, headers: {}, body: null } as any,
          assertions: [
            { passed: true, assertion: { field: 'status', operator: 'eq', value: 201 }, actual: 201, message: 'status eq 201' },
            { passed: false, assertion: { field: 'latency', operator: 'lt', value: 5 }, actual: 8, message: 'expected latency < 5, got 8' }
          ],
          passed: false,
          duration: 8
        }
      ]
    });

    const xml = toJUnit(result);

    expect(xml).toContain('<testsuite name="my-collection" tests="2" failures="1"');
    expect(xml).toContain('<testcase name="create-todo :: status eq 201" classname="my-collection"');
    expect(xml).toContain('<testcase name="create-todo :: expected latency &lt; 5, got 8" classname="my-collection"');
  });

  it('treats a request with no assertions as one implicit testcase that passes if status < 500', () => {
    const result = baseResult({
      total: 2,
      passed: 2,
      failed: 0,
      results: [
        {
          requestName: 'get-todo',
          response: { status: 200, latency: 3, headers: {}, body: null } as any,
          assertions: [],
          passed: true,
          duration: 3
        },
        {
          requestName: 'get-broken',
          response: { status: 503, latency: 9, headers: {}, body: null } as any,
          assertions: [],
          passed: true,
          duration: 9
        }
      ]
    });

    const xml = toJUnit(result);

    expect(xml).toContain('<testsuite name="my-collection" tests="2" failures="1"');
    expect(xml).toContain('<testcase name="get-todo" classname="my-collection"');
    expect(xml).toContain('<testcase name="get-broken" classname="my-collection"');
    expect(xml).toContain('<failure message="status 503 &gt;= 500">status 503 &gt;= 500</failure>');
  });

  it('emits a failure for a request that errored (no response) with no assertions', () => {
    const result = baseResult({
      total: 1,
      passed: 0,
      failed: 1,
      results: [
        {
          requestName: 'get-todo',
          response: null,
          assertions: [],
          passed: false,
          duration: 3,
          error: 'RequestError: fetch failed (ECONNREFUSED)'
        }
      ]
    });

    const xml = toJUnit(result);

    expect(xml).toContain('<testsuite name="my-collection" tests="1" failures="1"');
    expect(xml).toContain('ECONNREFUSED');
    expect(xml).toContain('<failure');
  });

  it('reports the total suite time as the sum of request durations in seconds', () => {
    const result = baseResult({
      total: 2,
      passed: 2,
      failed: 0,
      results: [
        { requestName: 'a', response: { status: 200, latency: 1, headers: {}, body: null } as any, assertions: [], passed: true, duration: 1500 },
        { requestName: 'b', response: { status: 200, latency: 1, headers: {}, body: null } as any, assertions: [], passed: true, duration: 500 }
      ]
    });

    const xml = toJUnit(result);

    expect(xml).toContain('time="2.000"');
  });
});

describe('toJUnitFromFlow', () => {
  it('outputs one testcase per step, with a <failure> on failed steps', () => {
    const result: FlowRunResult = {
      flowName: 'my-flow',
      passed: false,
      duration: 30,
      steps: [
        { stepId: 'create-post', type: 'run', passed: true, duration: 20 },
        { stepId: 'get-nonexistent', type: 'run', passed: false, error: 'expected 404, got 500', duration: 10 }
      ]
    };

    const xml = toJUnitFromFlow(result);

    expect(xml).toContain('<testsuite name="my-flow" tests="2" failures="1"');
    expect(xml).toContain('<testcase name="create-post" classname="my-flow" time="0.020"/>');
    expect(xml).toContain('<failure message="expected 404, got 500">expected 404, got 500</failure>');
  });

  it('flattens dataRows when the flow ran with data-driven rows', () => {
    const result: FlowRunResult = {
      flowName: 'data-driven-flow',
      passed: true,
      duration: 10,
      steps: [],
      dataRows: [
        { data: { userId: '1' }, passed: true, steps: [{ stepId: 'get-user', type: 'run', passed: true, duration: 5 }] },
        { data: { userId: '2' }, passed: true, steps: [{ stepId: 'get-user', type: 'run', passed: true, duration: 5 }] }
      ]
    };

    const xml = toJUnitFromFlow(result);

    expect(xml).toContain('<testsuite name="data-driven-flow" tests="2" failures="0"');
  });
});
