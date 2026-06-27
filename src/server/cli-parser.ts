import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ParsedArgs {
  command: 'start' | 'run' | 'run-flow' | 'mock' | 'setup' | 'use' | 'status' | 'stop' | 'exec' | 'import';
  args: string[];
  collection?: string;
  flags: {
    env?: string;
    reporter?: string;
    projectDir?: string;
    port?: string;
    collection?: string;
    dataRow?: string;
    envFiles?: string[];
    validateSpec?: boolean;
  };
}

// Resolves the project root the server should treat as the `.reqly` home.
// Priority: --project-dir flag > REQLY_PROJECT_DIR env var > activeProject in
// ~/.reqly/config.json (set via `reqly use`) > the process's cwd.
// The env var and config fallback exist because some MCP hosts (Claude Desktop)
// spawn one global server process with no per-project cwd and no way to inject
// per-project launch args - these are the escape hatches for that case.
export function resolveProjectDir(opts: { flag?: string; env?: string; configActiveProject?: string; cwd: string }): string {
  const dir = opts.flag ?? opts.env ?? opts.configActiveProject;
  return dir ? path.resolve(opts.cwd, dir) : opts.cwd;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: 'start',
    args: [],
    flags: {}
  };

  const args = argv.slice(2); // skip node and script
  let i = 0;

  // check if first non-flag argument is a command
  const validCommands = ['start', 'run', 'run-flow', 'mock', 'setup', 'use', 'status', 'stop', 'exec', 'import'];
  let commandFound = false;
  // once `exec`'s child command starts, everything after it (including its own
  // dashed flags) is passed through verbatim rather than parsed as reqly flags
  let inPassthrough = false;

  while (i < args.length) {
    const arg = args[i];

    if (inPassthrough) {
      result.args.push(arg);
      i++;
      continue;
    }

    if (arg === '--env') {
      result.flags.env = args[++i];
    } else if (arg === '--reporter') {
      result.flags.reporter = args[++i];
    } else if (arg === '--project-dir') {
      result.flags.projectDir = args[++i];
    } else if (arg === '--port') {
      result.flags.port = args[++i];
    } else if (arg === '--collection') {
      result.flags.collection = args[++i];
    } else if (arg === '--data-row') {
      result.flags.dataRow = args[++i];
    } else if (arg === '--env-file') {
      (result.flags.envFiles ??= []).push(args[++i]);
    } else if (arg === '--validate-spec') {
      result.flags.validateSpec = true;
    } else if (arg === '--version' || arg === '-v') {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
        console.log(pkg.version);
      } catch (e) {
        console.log('unknown');
      }
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      if (!commandFound && validCommands.includes(arg)) {
        result.command = arg as 'start' | 'run' | 'run-flow' | 'mock' | 'setup' | 'use' | 'status' | 'stop' | 'exec' | 'import';
        commandFound = true;
      } else {
        result.args.push(arg);
        // For 'mock' and 'run' / 'run-flow', the first positional arg after the command is the collection name
        if (commandFound && (result.command === 'mock' || result.command === 'run' || result.command === 'run-flow') && !result.collection) {
          result.collection = arg;
        }
        if (commandFound && result.command === 'exec') {
          inPassthrough = true;
        }
      }
    }
    i++;
  }

  return result;
}
