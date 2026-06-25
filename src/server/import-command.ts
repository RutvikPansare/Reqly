import * as path from 'path';
import { CollectionManager } from '../engine/collection-manager.js';
import { importFromFile } from '../engine/importer.js';
import { ParsedArgs } from './cli-parser.js';

function detectFormat(filePath: string): 'postman' | 'bruno' | null {
  if (filePath.endsWith('.json')) return 'postman';
  if (filePath.endsWith('.bru')) return 'bruno';
  // directory - assume Bruno
  return 'bruno';
}

export async function handleImportCommand(
  parsed: ParsedArgs,
  collectionManager: CollectionManager
): Promise<number> {
  const [sourcePath] = parsed.args;

  if (!sourcePath) {
    console.error('Usage: reqly import <file-or-directory>');
    console.error('  Postman: reqly import collection.json');
    console.error('  Bruno:   reqly import request.bru');
    console.error('  Bruno:   reqly import ./my-collection-dir/');
    return 1;
  }

  const resolved = path.resolve(sourcePath);
  const format = detectFormat(resolved);

  if (!format) {
    console.error('Cannot detect format. Use a .json file (Postman) or a .bru file/directory (Bruno).');
    return 1;
  }

  try {
    const result = await importFromFile(resolved, format, collectionManager);
    console.log(`Imported ${result.requestsImported} request(s) into collection "${result.collectionName}".`);
    return 0;
  } catch (e: any) {
    console.error(`Import failed: ${e.message}`);
    return 1;
  }
}
