import { describe, it, expect } from 'vitest';
import { mergeConfigPatch } from './express.js';

describe('mergeConfigPatch (T-251)', () => {
  it('starts fresh when there is no existing config file', () => {
    const result = mergeConfigPatch(null, { theme: 'dark' });
    expect(result).toEqual({ next: { theme: 'dark' } });
  });

  it('shallow-merges a patch onto valid existing config', () => {
    const existing = JSON.stringify({ activeProject: '/p', authProfiles: [{ id: 'a' }] });
    const result = mergeConfigPatch(existing, { sidebarOrder: ['x'] });
    expect(result).toEqual({
      next: { activeProject: '/p', authProfiles: [{ id: 'a' }], sidebarOrder: ['x'] },
    });
  });

  it('overwrites overlapping top-level keys with the patch value', () => {
    const existing = JSON.stringify({ launchAtLogin: false, other: 1 });
    const result = mergeConfigPatch(existing, { launchAtLogin: true });
    expect(result).toEqual({ next: { launchAtLogin: true, other: 1 } });
  });

  // Regression: a corrupt-but-present config must NOT be treated as empty -
  // that silently wiped auth profiles, workspaces, and secret providers.
  it('refuses to overwrite a config file that is present but not valid JSON', () => {
    const result = mergeConfigPatch('{ this is : not json', { launchAtLogin: true });
    expect(result).toHaveProperty('error');
    expect('next' in result).toBe(false);
  });
});
