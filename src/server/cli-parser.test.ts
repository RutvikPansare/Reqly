import { describe, it, expect } from 'vitest';
import { parseArgs } from './cli-parser.js';

describe('cli-parser', () => {
  it('defaults to start command when no command is provided', () => {
    const parsed = parseArgs(['node', 'script.js']);
    expect(parsed.command).toBe('start');
    expect(parsed.args).toEqual([]);
    expect(parsed.flags).toEqual({});
  });

  it('parses start command', () => {
    const parsed = parseArgs(['node', 'script.js', 'start']);
    expect(parsed.command).toBe('start');
    expect(parsed.args).toEqual([]);
  });

  it('parses run command with arguments', () => {
    const parsed = parseArgs(['node', 'script.js', 'run', 'collectionName', 'requestName']);
    expect(parsed.command).toBe('run');
    expect(parsed.args).toEqual(['collectionName', 'requestName']);
  });

  it('parses flags before and after command', () => {
    const parsed = parseArgs(['node', 'script.js', '--env', 'production', 'run', 'myCol', '--reporter', 'json', '--project-dir', '/tmp']);
    expect(parsed.command).toBe('run');
    expect(parsed.args).toEqual(['myCol']);
    expect(parsed.flags).toEqual({
      env: 'production',
      reporter: 'json',
      projectDir: '/tmp'
    });
  });
});
