import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { definition, handler } from './export-flow-ci.js';
import { CollectionManager } from '../../engine/collection-manager.js';
import { FlowManager } from '../../engine/flow-manager.js';

describe('export_flow_ci', () => {
  let tmpDir: string;
  let reqlyDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-export-flow-test-'));
    reqlyDir = path.join(tmpDir, '.reqly');
    const flowManager = new FlowManager(reqlyDir);
    await flowManager.createFlow('checkout-e2e');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeContext() {
    return {
      collectionManager: new CollectionManager(reqlyDir),
      flowManager: new FlowManager(reqlyDir),
    } as any;
  }

  it('should have correct definition', () => {
    expect(definition.name).toBe('export_flow_ci');
    expect(definition.inputSchema.required).toEqual(['flow', 'format']);
  });

  it('writes the workflow file and returns its path', async () => {
    const res = await handler({ flow: 'checkout-e2e', format: 'github-actions' }, makeContext());
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.path).toBe(path.join('.github', 'workflows', 'checkout-e2e.yml'));

    const written = fs.readFileSync(path.join(tmpDir, parsed.path), 'utf8');
    expect(written).toContain('name: checkout-e2e');
    expect(written).toContain('run: reqly run-flow checkout-e2e');
  });

  it('creates the .github/workflows directory if it does not exist', async () => {
    expect(fs.existsSync(path.join(tmpDir, '.github'))).toBe(false);
    await handler({ flow: 'checkout-e2e', format: 'github-actions' }, makeContext());
    expect(fs.existsSync(path.join(tmpDir, '.github', 'workflows', 'checkout-e2e.yml'))).toBe(true);
  });

  it('returns an error for an unsupported format', async () => {
    const res = await handler({ flow: 'checkout-e2e', format: 'circleci' }, makeContext());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Unsupported format');
  });

  it('returns an error when the flow does not exist', async () => {
    const res = await handler({ flow: 'missing-flow', format: 'github-actions' }, makeContext());
    expect(res.isError).toBe(true);
  });
});
