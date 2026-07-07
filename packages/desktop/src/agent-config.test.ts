import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isSetupComplete, markSetupComplete } from './agent-config';

describe('agent-config setup flag (config safety)', () => {
  let dir: string;
  let cfg: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqly-agentcfg-'));
    cfg = path.join(dir, 'config.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('creates the config when none exists', () => {
    markSetupComplete(cfg);
    expect(JSON.parse(fs.readFileSync(cfg, 'utf8')).setupComplete).toBe(true);
    expect(isSetupComplete(cfg)).toBe(true);
  });

  it('preserves existing keys when marking setup complete', () => {
    fs.writeFileSync(cfg, JSON.stringify({ authProfiles: [{ id: 'a' }], activeProject: '/p' }));
    markSetupComplete(cfg);
    const out = JSON.parse(fs.readFileSync(cfg, 'utf8'));
    expect(out.setupComplete).toBe(true);
    expect(out.authProfiles).toEqual([{ id: 'a' }]);
    expect(out.activeProject).toBe('/p');
  });

  // Regression: a corrupt-but-present config used to be caught and overwritten
  // with just { setupComplete: true }, wiping profiles/workspaces/secrets.
  it('refuses to overwrite a corrupt config (no wipe)', () => {
    fs.writeFileSync(cfg, '{ not: valid json ');
    markSetupComplete(cfg);
    // File left untouched; nothing wiped.
    expect(fs.readFileSync(cfg, 'utf8')).toBe('{ not: valid json ');
  });
});
