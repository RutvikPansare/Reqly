import { describe, it, expect } from 'vitest';
import { generateGithubActionsWorkflow } from './github-actions-export.js';

describe('generateGithubActionsWorkflow', () => {
  it('substitutes the flow name into the workflow name field', () => {
    const yaml = generateGithubActionsWorkflow('checkout-e2e');
    expect(yaml).toContain('name: checkout-e2e');
  });

  it('substitutes the flow name into the run-flow command', () => {
    const yaml = generateGithubActionsWorkflow('checkout-e2e');
    expect(yaml).toContain('run: reqly run-flow checkout-e2e');
  });

  it('includes the install, start, and checkout steps', () => {
    const yaml = generateGithubActionsWorkflow('my-flow');
    expect(yaml).toContain('uses: actions/checkout@v4');
    expect(yaml).toContain('npm install -g @rutvikpansare123/reqly');
    expect(yaml).toContain('reqly start --project-dir . &');
  });

  it('triggers on push and pull_request', () => {
    const yaml = generateGithubActionsWorkflow('my-flow');
    expect(yaml).toContain('on: [push, pull_request]');
  });

  it('handles flow names with spaces and special characters as-is', () => {
    const yaml = generateGithubActionsWorkflow('checkout flow');
    expect(yaml).toContain('name: checkout flow');
    expect(yaml).toContain('run: reqly run-flow checkout flow');
  });
});
