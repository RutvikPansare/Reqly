import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { handleSetupCommand } from './setup-command.js';

vi.mock('fs/promises');

describe('handleSetupCommand', () => {
  const originalPlatform = process.platform;
  const originalAppData = process.env.APPDATA;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.readFile).mockRejectedValue(new Error('not found'));
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env.APPDATA = originalAppData;
  });

  it('writes Claude Desktop config under APPDATA on win32', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.APPDATA = 'C:\\Users\\Rutvik\\AppData\\Roaming';

    await handleSetupCommand({ args: ['claude'] } as any);

    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    const [writtenPath] = vi.mocked(fs.writeFile).mock.calls[0];
    expect(writtenPath).toContain('AppData');
    expect(writtenPath).toContain('Claude');
  });

  it('throws a helpful error and does not write when APPDATA is unset on win32', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    delete process.env.APPDATA;

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleSetupCommand({ args: ['claude'] } as any);

    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to configure Claude Desktop'),
      expect.stringContaining('APPDATA')
    );
  });
});
