import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'dotenv';
import { SecretProviderRegistry } from '../engine/secret-providers/index.js';

export const SECRETS_USAGE = 'Usage: reqly secrets resolve  (resolves vault URIs from .env into .env.local)';

// `reqly secrets resolve`: finds vault URIs in the configured .env files,
// resolves them, and writes the plaintext values to .env.local for tools that
// don't understand vault URIs. Never modifies .env. Unrelated keys already in
// .env.local are preserved; managed keys are overwritten with fresh values.
export async function handleSecretsCommand(
  action: string,
  projectDir: string,
  dotenvFiles: string[],
  registry: SecretProviderRegistry
): Promise<number> {
  if (action !== 'resolve') {
    console.error(SECRETS_USAGE);
    return 1;
  }

  // Collect vault-URI entries from the source files (later files win, like the loader).
  const secretEntries = new Map<string, string>();
  for (const file of dotenvFiles.filter(f => f !== '.env.local')) {
    const filePath = path.join(projectDir, file);
    if (!fs.existsSync(filePath)) continue;
    const parsed = parse(fs.readFileSync(filePath, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (registry.isSecretUri(value)) secretEntries.set(key, value);
    }
  }

  if (secretEntries.size === 0) {
    console.log('No vault URIs found in ' + dotenvFiles.join(', ') + ' - nothing to resolve.');
    return 0;
  }

  const resolved = new Map<string, string>();
  const failures: Array<{ key: string; uri: string; error: string }> = [];
  for (const [key, uri] of secretEntries) {
    try {
      resolved.set(key, await registry.resolve(uri));
    } catch (e: any) {
      failures.push({ key, uri, error: e.message });
    }
  }

  for (const f of failures) {
    console.error(`  ✗ ${f.key} (${f.uri}): ${f.error}`);
  }

  if (resolved.size > 0) {
    const localPath = path.join(projectDir, '.env.local');
    const existing = fs.existsSync(localPath) ? parse(fs.readFileSync(localPath, 'utf8')) : {};
    const merged: Record<string, string> = { ...existing };
    for (const [key, value] of resolved) merged[key] = value;
    const lines = Object.entries(merged).map(([k, v]) => `${k}=${v}`);
    fs.writeFileSync(localPath, lines.join('\n') + '\n');
    console.log(`Resolved ${resolved.size} secret(s) into .env.local (make sure it is gitignored).`);
  }

  return failures.length > 0 ? 1 : 0;
}
