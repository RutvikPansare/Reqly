import * as fs from 'fs/promises';
import * as path from 'path';

const FRAMEWORK_DEPS: Array<[string, string]> = [
  ['next', 'Next.js'],
  ['@nestjs/core', 'NestJS'],
  ['fastify', 'Fastify'],
  ['express', 'Express'],
  ['@hapi/hapi', 'Hapi'],
  ['koa', 'Koa'],
];

export async function detectFramework(projectRoot: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [dep, name] of FRAMEWORK_DEPS) {
      if (deps[dep]) return name;
    }
    return null;
  } catch {
    return null;
  }
}
