import * as fs from 'fs/promises';
import { CollectionRunner, CollectionRunResult, RunOptions } from './collection-runner.js';
import { EngineContext } from '../mcp/tools/types.js';

export interface DataRunResult {
  collection: string;
  runs: {
    rowNumber: number;
    data: Record<string, string>;
    result: CollectionRunResult;
  }[];
}

export class DataRunner {
  private runner: CollectionRunner;

  constructor(context: EngineContext) {
    this.runner = new CollectionRunner(context);
  }

  public async run(collectionName: string, dataFilePath: string, options: RunOptions = {}): Promise<DataRunResult> {
    const content = await fs.readFile(dataFilePath, 'utf-8');
    const rows = this.parseData(dataFilePath, content);
    
    if (rows.length === 0) {
      throw new Error('Data file is empty or invalid');
    }

    const runs = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowOptions: RunOptions = {
        ...options,
        dataVariables: row
      };
      
      const result = await this.runner.run(collectionName, rowOptions);
      runs.push({
        rowNumber: i + 1,
        data: row,
        result
      });
    }
    
    return {
      collection: collectionName,
      runs
    };
  }

  private parseData(filePath: string, content: string): Record<string, string>[] {
    if (filePath.endsWith('.json')) {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) throw new Error('JSON data file must contain an array of objects');
      
      return parsed.map(row => {
        if (typeof row !== 'object' || row === null) {
          throw new Error('JSON data file must contain an array of objects');
        }
        const strRow: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          strRow[k] = String(v);
        }
        return strRow;
      });
    } else if (filePath.endsWith('.csv')) {
      return this.parseCsv(content);
    }
    throw new Error('Unsupported data file format. Use .json or .csv');
  }

  private parseCsv(content: string): Record<string, string>[] {
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];
    
    const parseLine = (line: string) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current);
      return result;
    };
    
    const headers = parseLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = parseLine(lines[i]);
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        // Strip leading/trailing quotes if they perfectly wrap the value
        let val = vals[j] || '';
        if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
          val = val.substring(1, val.length - 1);
        }
        
        let header = headers[j];
        if (header.startsWith('"') && header.endsWith('"') && header.length >= 2) {
          header = header.substring(1, header.length - 1);
        }
        
        row[header] = val;
      }
      rows.push(row);
    }
    return rows;
  }
}
