import { describe, it, expect, vi } from 'vitest';
import { DataRunner } from './data-runner.js';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('DataRunner', () => {
  it('should parse CSV and run collection per row', async () => {
    const csvContent = `id,name\n1,Alice\n2,Bob`;
    vi.mocked(fs.readFile).mockResolvedValue(csvContent);

    const mockCollectionRunnerRun = vi.fn().mockResolvedValue({ passed: 1 });
    
    const context: any = {}; // Mock EngineContext
    
    const dataRunner = new DataRunner(context);
    // Inject mock runner
    (dataRunner as any).runner = { run: mockCollectionRunnerRun };

    const result = await dataRunner.run('my-col', 'data.csv');
    
    expect(result.collection).toBe('my-col');
    expect(result.runs.length).toBe(2);
    expect(result.runs[0].data).toEqual({ id: '1', name: 'Alice' });
    expect(result.runs[1].data).toEqual({ id: '2', name: 'Bob' });
    
    expect(mockCollectionRunnerRun).toHaveBeenCalledTimes(2);
    expect(mockCollectionRunnerRun).toHaveBeenNthCalledWith(1, 'my-col', expect.objectContaining({
      dataVariables: { id: '1', name: 'Alice' }
    }));
  });

  it('should parse JSON and run collection per row', async () => {
    const jsonContent = JSON.stringify([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]);
    vi.mocked(fs.readFile).mockResolvedValue(jsonContent);

    const mockCollectionRunnerRun = vi.fn().mockResolvedValue({ passed: 1 });
    const context: any = {}; 
    const dataRunner = new DataRunner(context);
    (dataRunner as any).runner = { run: mockCollectionRunnerRun };

    const result = await dataRunner.run('my-col', 'data.json');
    
    // Values should be stringified
    expect(result.runs[0].data).toEqual({ id: '1', name: 'Alice' });
  });

  it('should handle quoted CSV values', async () => {
    const csvContent = `"id","name"\n"1","Alice, Smith"`;
    vi.mocked(fs.readFile).mockResolvedValue(csvContent);

    const mockCollectionRunnerRun = vi.fn().mockResolvedValue({ passed: 1 });
    const context: any = {}; 
    const dataRunner = new DataRunner(context);
    (dataRunner as any).runner = { run: mockCollectionRunnerRun };

    const result = await dataRunner.run('my-col', 'data.csv');
    
    expect(result.runs[0].data).toEqual({ id: '1', name: 'Alice, Smith' });
  });

  it('should throw error for unsupported extension', async () => {
    const context: any = {}; 
    const dataRunner = new DataRunner(context);
    vi.mocked(fs.readFile).mockResolvedValue('');
    
    await expect(dataRunner.run('my-col', 'data.xml')).rejects.toThrow('Unsupported data file format');
  });
});
