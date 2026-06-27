import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { ParsedArgs } from './cli-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function defaultStarterDir(): string {
  return path.join(__dirname, '..', '..', 'example', 'reqly-starter', '.reqly');
}

async function copyMerge(src: string, dest: string, created: string[], skipped: string[]): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  await fs.mkdir(dest, { recursive: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyMerge(srcPath, destPath, created, skipped);
    } else {
      try {
        await fs.access(destPath);
        skipped.push(destPath);
      } catch {
        await fs.copyFile(srcPath, destPath);
        created.push(destPath);
      }
    }
  }
}

export async function handleInitCommand(_parsed: ParsedArgs, targetDir: string, starterDir: string = defaultStarterDir()): Promise<number> {
  try {
    await fs.access(starterDir);
  } catch {
    console.error(`Could not find the Reqly starter collection at ${starterDir}.`);
    return 1;
  }

  const targetReqlyDir = path.join(targetDir, '.reqly');
  const created: string[] = [];
  const skipped: string[] = [];

  await copyMerge(starterDir, targetReqlyDir, created, skipped);

  console.log(`Reqly starter collection initialized in ${targetReqlyDir}`);
  console.log(`  ${created.length} file(s) created.`);
  if (skipped.length > 0) {
    console.log(`  ${skipped.length} file(s) skipped (already exist).`);
  }

  return 0;
}
