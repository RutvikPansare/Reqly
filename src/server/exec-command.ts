import { spawn } from 'child_process';
import { ProxyServer } from '../engine/proxy.js';
import { ParsedArgs } from './cli-parser.js';

export async function handleExecCommand(parsed: ParsedArgs, proxyServer: ProxyServer): Promise<number> {
  const [command, ...commandArgs] = parsed.args;

  if (!command) {
    console.error('Error: a command is required, e.g. `reqly exec npm run dev`');
    return 1;
  }

  const port = parsed.flags.port ? parseInt(parsed.flags.port, 10) : 8080;
  const collectionName = parsed.flags.collection || 'Captured';

  await proxyServer.start({ port, collectionName });

  const child = spawn(command, commandArgs, {
    env: { ...process.env, HTTP_PROXY: `http://localhost:${port}`, HTTPS_PROXY: `http://localhost:${port}` },
    stdio: 'inherit',
    shell: true
  });

  const forwardSigint = () => {
    child.kill('SIGINT');
  };
  process.on('SIGINT', forwardSigint);

  return new Promise<number>((resolve) => {
    child.on('exit', async (code) => {
      process.off('SIGINT', forwardSigint);
      await proxyServer.stop();
      const captured = (proxyServer as any).capturedRequests?.length ?? 0;
      console.error(`Proxy stopped. Captured ${captured} request${captured === 1 ? '' : 's'} into "${collectionName}".`);
      resolve(code ?? 0);
    });
  });
}
