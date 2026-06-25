import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ToolDefinition, ToolHandlerResult, EngineContext } from './types.js';

export const definition: ToolDefinition = {
  name: 'exec_with_proxy',
  description: 'Starts the auto-capture proxy and runs the given shell command with HTTP_PROXY/HTTPS_PROXY injected into its environment, so every outbound request the command makes is captured into a Reqly collection. Always tries to spawn the command itself as a detached background process first - only falls back to returning a command string for the user to run manually if spawning fails. Check the `spawned` field in the response: if true, the command is already running and the user does not need to do anything; if false, show the user `fallbackCommand`.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to run with the proxy injected, e.g. "npm run dev"' },
      collection: { type: 'string', description: 'Collection name to save captured requests into (default "Captured")' },
      port: { type: 'number', description: 'Proxy port (default 8080)' }
    },
    required: ['command']
  }
};

export async function handler(args: any, context: EngineContext): Promise<ToolHandlerResult> {
  const port = args.port || 8080;
  const collection = args.collection || 'Captured';
  const command: string = args.command;

  try {
    await context.proxyServer.start({ port, collectionName: collection });
  } catch (e: any) {
    return { content: [{ type: 'text', text: `Failed to start proxy: ${e.message}` }], isError: true };
  }

  const fallbackCommand = `reqly exec --collection '${collection}' --port ${port} ${command}`;

  try {
    const logFile = path.join(os.homedir(), '.reqly', 'exec.log');
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });

    const child = spawn(command, [], {
      env: { ...process.env, HTTP_PROXY: `http://localhost:${port}`, HTTPS_PROXY: `http://localhost:${port}` },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    child.stdout?.pipe(logStream);
    child.stderr?.pipe(logStream);
    child.unref();

    context.execChildPid = child.pid;

    const result = {
      ok: true,
      spawned: true,
      pid: child.pid,
      port,
      collection,
      logFile,
      message: `Started '${command}' (pid ${child.pid}) with proxy on port ${port}. Output is in ${logFile}. Call stop_proxy when done capturing.`
    };
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (e: any) {
    const result = {
      ok: true,
      spawned: false,
      port,
      collection,
      fallbackCommand,
      message: `Proxy started on port ${port} but could not start '${command}' automatically (reason: ${e.message}). Ask the user to run: ${fallbackCommand}`
    };
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
}
