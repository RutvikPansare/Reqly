import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleExportCommand } from './export-command.js';
import type { CollectionManager } from '../engine/collection-manager.js';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs');

const mockCollection = {
  name: 'Test API',
  requests: [
    { name: 'Req 1', method: 'GET', url: 'https://example.com' }
  ]
};

describe('handleExportCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('fails if type or collection name is missing', async () => {
    const mgr = {} as CollectionManager;
    const exit = await handleExportCommand({ args: ['docs'], command: 'export', flags: {} }, mgr);
    expect(exit).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Usage: reqly export'));
  });

  it('fails if type is not docs', async () => {
    const mgr = {} as CollectionManager;
    const exit = await handleExportCommand({ args: ['postman', 'col1'], command: 'export', flags: {} }, mgr);
    expect(exit).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unsupported export type: postman'));
  });

  it('fails if collection is not found', async () => {
    const mgr = { getCollection: vi.fn().mockResolvedValue(null) } as unknown as CollectionManager;
    const exit = await handleExportCommand({ args: ['docs', 'missing'], command: 'export', flags: {} }, mgr);
    expect(exit).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Collection not found'));
  });

  it('exports to default path if no output flag', async () => {
    const mgr = { getCollection: vi.fn().mockResolvedValue(mockCollection) } as unknown as CollectionManager;
    (fs.existsSync as any).mockReturnValue(false);
    
    const exit = await handleExportCommand({ args: ['docs', 'Test API'], command: 'export', flags: {} }, mgr);
    expect(exit).toBe(0);
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining(path.join('docs', 'api')), { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(path.join('docs', 'api', 'Test API.md')),
      expect.stringContaining('# Test API'),
      'utf-8'
    );
  });

  it('exports to specified output path', async () => {
    const mgr = { getCollection: vi.fn().mockResolvedValue(mockCollection) } as unknown as CollectionManager;
    (fs.existsSync as any).mockReturnValue(true);
    
    const exit = await handleExportCommand({ args: ['docs', 'Test API'], command: 'export', flags: { output: 'custom/out.md' } }, mgr);
    expect(exit).toBe(0);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      'custom/out.md',
      expect.stringContaining('# Test API'),
      'utf-8'
    );
  });
});
