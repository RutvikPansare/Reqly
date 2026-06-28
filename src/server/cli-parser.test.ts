import { describe, it, expect } from 'vitest';
import { parseArgs, resolveProjectDir } from './cli-parser.js';

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

  it('parses use command with a path argument', () => {
    const parsed = parseArgs(['node', 'script.js', 'use', '/Users/dev/my-project']);
    expect(parsed.command).toBe('use');
    expect(parsed.args).toEqual(['/Users/dev/my-project']);
  });

  it('parses status command', () => {
    const parsed = parseArgs(['node', 'script.js', 'status']);
    expect(parsed.command).toBe('status');
    expect(parsed.args).toEqual([]);
  });

  it('parses exec command with a simple child command', () => {
    const parsed = parseArgs(['node', 'script.js', 'exec', 'npm', 'run', 'dev']);
    expect(parsed.command).toBe('exec');
    expect(parsed.args).toEqual(['npm', 'run', 'dev']);
  });

  it('parses exec flags before the child command, leaving the child command untouched', () => {
    const parsed = parseArgs(['node', 'script.js', 'exec', '--collection', 'Dabbr API', '--port', '8888', 'npm', 'run', 'dev']);
    expect(parsed.command).toBe('exec');
    expect(parsed.flags.collection).toBe('Dabbr API');
    expect(parsed.flags.port).toBe('8888');
    expect(parsed.args).toEqual(['npm', 'run', 'dev']);
  });

  it('passes the child command through verbatim, including dashed flags meant for it', () => {
    const parsed = parseArgs(['node', 'script.js', 'exec', 'python', 'manage.py', 'runserver', '--port', '8000']);
    expect(parsed.command).toBe('exec');
    expect(parsed.args).toEqual(['python', 'manage.py', 'runserver', '--port', '8000']);
    expect(parsed.flags.port).toBeUndefined();
  });

  it('parses run-flow command with a flow name', () => {
    const parsed = parseArgs(['node', 'script.js', 'run-flow', 'Login Flow']);
    expect(parsed.command).toBe('run-flow');
    expect(parsed.args).toEqual(['Login Flow']);
  });

  it('parses run-flow with --data-row and --reporter flags', () => {
    const parsed = parseArgs(['node', 'script.js', 'run-flow', 'Login Flow', '--data-row', '{"userId":"99"}', '--reporter', 'json']);
    expect(parsed.command).toBe('run-flow');
    expect(parsed.args).toEqual(['Login Flow']);
    expect(parsed.flags.dataRow).toBe('{"userId":"99"}');
    expect(parsed.flags.reporter).toBe('json');
  });

  it('collects repeated --env-file flags into an ordered array', () => {
    const parsed = parseArgs(['node', 'script.js', 'start', '--env-file', '.env', '--env-file', '.env.local']);
    expect(parsed.flags.envFiles).toEqual(['.env', '.env.local']);
  });

  it('leaves envFiles undefined when --env-file is not passed', () => {
    const parsed = parseArgs(['node', 'script.js', 'start']);
    expect(parsed.flags.envFiles).toBeUndefined();
  });

  it('parses --validate-spec as a boolean flag on run', () => {
    const parsed = parseArgs(['node', 'script.js', 'run', 'API', '--validate-spec']);
    expect(parsed.command).toBe('run');
    expect(parsed.args).toEqual(['API']);
    expect(parsed.flags.validateSpec).toBe(true);
  });

  it('leaves validateSpec undefined when --validate-spec is not passed', () => {
    const parsed = parseArgs(['node', 'script.js', 'run', 'API']);
    expect(parsed.flags.validateSpec).toBeUndefined();
  });

  it('parses export-flow command with a flow name and --format flag', () => {
    const parsed = parseArgs(['node', 'script.js', 'export-flow', 'checkout-e2e', '--format', 'github-actions']);
    expect(parsed.command).toBe('export-flow');
    expect(parsed.args).toEqual(['checkout-e2e']);
    expect(parsed.flags.format).toBe('github-actions');
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

describe('resolveProjectDir', () => {
  it('falls back to cwd when neither flag nor env var is set', () => {
    expect(resolveProjectDir({ cwd: '/home/user/project' })).toBe('/home/user/project');
  });

  it('uses REQLY_PROJECT_DIR env var when no flag is given', () => {
    expect(resolveProjectDir({ env: '/home/user/project', cwd: '/' })).toBe('/home/user/project');
  });

  it('prefers --project-dir flag over the env var', () => {
    expect(resolveProjectDir({ flag: '/flag/dir', env: '/env/dir', cwd: '/' })).toBe('/flag/dir');
  });

  it('resolves a relative flag against cwd', () => {
    expect(resolveProjectDir({ flag: '../sibling', cwd: '/home/user/project' })).toBe('/home/user/sibling');
  });

  it('uses configActiveProject when no flag or env var is set', () => {
    expect(resolveProjectDir({ configActiveProject: '/home/user/tellero', cwd: '/' })).toBe('/home/user/tellero');
  });

  it('prefers env var over configActiveProject', () => {
    expect(resolveProjectDir({ env: '/env/dir', configActiveProject: '/config/dir', cwd: '/' })).toBe('/env/dir');
  });

  it('prefers flag over configActiveProject', () => {
    expect(resolveProjectDir({ flag: '/flag/dir', configActiveProject: '/config/dir', cwd: '/' })).toBe('/flag/dir');
  });
});
