import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'child_process';
import { killProcessTree } from './process-utils.js';

vi.mock('child_process');

describe('killProcessTree', () => {
  const originalPlatform = process.platform;
  let killSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    killSpy.mockRestore();
  });

  it('uses taskkill on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    vi.mocked(childProcess.execSync).mockReturnValue(Buffer.from(''));

    killProcessTree(1234);

    expect(childProcess.execSync).toHaveBeenCalledWith('taskkill /PID 1234 /T /F');
    expect(killSpy).not.toHaveBeenCalled();
  });

  it('uses negative-PID process group kill on unix', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });

    killProcessTree(1234);

    expect(killSpy).toHaveBeenCalledWith(-1234);
    expect(childProcess.execSync).not.toHaveBeenCalled();
  });

  it('swallows ESRCH-style errors when process already gone on unix', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    killSpy.mockImplementation(() => {
      const err: any = new Error('No such process');
      err.code = 'ESRCH';
      throw err;
    });

    expect(() => killProcessTree(1234)).not.toThrow();
  });

  it('swallows errors when taskkill fails on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    vi.mocked(childProcess.execSync).mockImplementation(() => {
      throw new Error('process not found');
    });

    expect(() => killProcessTree(1234)).not.toThrow();
  });
});
