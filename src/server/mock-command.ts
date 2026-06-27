import { CollectionManager } from '../engine/collection-manager.js';
import { MockServer } from '../engine/mock-server.js';
import type { ParsedArgs } from './cli-parser.js';

export async function handleMockCommand(
  parsed: ParsedArgs,
  collectionManager: CollectionManager,
): Promise<number> {
  const collectionName = parsed.collection || parsed.flags.collection as string;
  if (!collectionName) {
    console.error('Error: collection name required. Usage: reqly mock <collection> [--port <n>]');
    return 1;
  }

  const port = Number(parsed.flags.port) || 4243;
  const mockServer = new MockServer(collectionManager);

  try {
    await mockServer.start(collectionName, port);
  } catch (e: any) {
    console.error(`Failed to start mock server: ${e.message}`);
    return 1;
  }

  const status = mockServer.getStatus();

  console.log(`\nReqly mock server running on port ${port}`);
  console.log(`Collection: ${collectionName}\n`);

  if (status.routes.length === 0) {
    console.log('  (no routes - add saved examples to requests in this collection)');
  } else {
    const methodW = 8;
    const pathW = Math.max(32, ...status.routes.map(r => r.path.length + 2));
    const header = `  ${'METHOD'.padEnd(methodW)}  ${'PATH'.padEnd(pathW)}  EXAMPLES`;
    console.log(header);
    console.log('  ' + '-'.repeat(header.length - 2));
    for (const route of status.routes) {
      console.log(`  ${route.method.padEnd(methodW)}  ${route.path.padEnd(pathW)}  ${route.exampleCount}`);
    }
  }

  console.log('\nPress Ctrl+C to stop.\n');

  // Block until SIGINT
  await new Promise<void>(resolve => {
    const onSignal = async () => {
      console.log('\nStopping mock server...');
      await mockServer.stop().catch(() => {});
      resolve();
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  });

  return 0;
}
