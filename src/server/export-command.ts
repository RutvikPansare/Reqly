import { CollectionManager } from '../engine/collection-manager.js';
import { ParsedArgs } from './cli-parser.js';
import { exportToDocs } from '../engine/exporter.js';
import * as path from 'path';
import * as fs from 'fs';

export async function handleExportCommand(parsed: ParsedArgs, collectionManager: CollectionManager): Promise<number> {
  const type = parsed.args[0];
  const collectionName = parsed.args[1];

  if (!type || !collectionName) {
    console.error('Usage: reqly export docs <collectionName> [--output <path>]');
    return 1;
  }

  if (type !== 'docs') {
    console.error(`Unsupported export type: ${type}. Only 'docs' is supported via CLI right now.`);
    return 1;
  }

  try {
    const col = await collectionManager.getCollection(collectionName);
    if (!col) {
      console.error(`Collection not found: ${collectionName}`);
      return 1;
    }

    const md = exportToDocs(col);
    
    let outPath = parsed.flags.output;
    if (!outPath) {
      outPath = path.join(process.cwd(), 'docs', 'api', `${collectionName}.md`);
    }

    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    fs.writeFileSync(outPath, md, 'utf-8');
    console.log(`Exported docs to: ${outPath}`);
    return 0;
  } catch (err: any) {
    console.error(`Export failed: ${err.message}`);
    return 1;
  }
}
