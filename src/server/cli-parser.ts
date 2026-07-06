import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ParsedArgs {
  command: 'start' | 'run' | 'run-flow' | 'mock' | 'setup' | 'use' | 'status' | 'stop' | 'exec' | 'import' | 'export' | 'export-flow' | 'init' | 'app' | 'workspace' | 'secrets';
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
    format?: string;
    data?: string;
    output?: string;
    silent?: boolean;
  };
}

export type ConfigSource = 'flag' | 'env' | 'config' | 'cwd';

export interface ResolvedProjectDir {
  dir: string;
  configSource: ConfigSource;
  fallbackReason?: string;
}

// Matches unresolved macro patterns from various tool hosts:
//   ${workspaceFolder}  - VS Code / Cursor (not interpolated by non-VS-Code hosts)
//   %WORKSPACE_FOLDER%  - Windows CMD style
//   {workspaceFolder}   - bare-brace style
//   $VARNAME            - shell-style (no braces)
const MACRO_RE = /^\$\{.+\}$|^%.+%$|^\{.+\}$|^\$[A-Z_][A-Z0-9_]*$/;

// Resolves the project root the server should treat as the `.reqly` home.
// Priority: --project-dir flag > REQLY_PROJECT_DIR env var > activeProject in
// ~/.reqly/config.json (set via `reqly use`) > the process's cwd.
// Returns the resolved dir plus metadata for agents (configSource, fallbackReason).
export function resolveProjectDir(opts: { flag?: string; env?: string; configActiveProject?: string; cwd: string }): ResolvedProjectDir {
  let flag = opts.flag;
  let fallbackReason: string | undefined;

  if (flag && MACRO_RE.test(flag)) {
    fallbackReason = `Ignoring --project-dir value that looks like an unresolved macro: ${flag}. Falling back to next source.`;
    console.error(`[reqly] ${fallbackReason}`);
    flag = undefined;
  }

  if (flag) {
    return { dir: path.resolve(opts.cwd, flag), configSource: 'flag' };
  }
  if (opts.env) {
    const result: ResolvedProjectDir = { dir: path.resolve(opts.cwd, opts.env), configSource: 'env' };
    if (fallbackReason) result.fallbackReason = fallbackReason;
    return result;
  }
  if (opts.configActiveProject) {
    const result: ResolvedProjectDir = { dir: path.resolve(opts.cwd, opts.configActiveProject), configSource: 'config' };
    if (fallbackReason) result.fallbackReason = fallbackReason;
    return result;
  }
  const result: ResolvedProjectDir = { dir: opts.cwd, configSource: 'cwd' };
  if (fallbackReason) result.fallbackReason = fallbackReason;
  return result;
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
  const validCommands = ['start', 'run', 'run-flow', 'mock', 'setup', 'use', 'status', 'stop', 'exec', 'import', 'export', 'export-flow', 'init', 'app', 'workspace', 'secrets'];
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
    } else if (arg === '--format') {
      result.flags.format = args[++i];
    } else if (arg === '--data') {
      result.flags.data = args[++i];
    } else if (arg === '--output') {
      result.flags.output = args[++i];
    } else if (arg === '--silent') {
      result.flags.silent = true;
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
        result.command = arg as 'start' | 'run' | 'run-flow' | 'mock' | 'setup' | 'use' | 'status' | 'stop' | 'exec' | 'import' | 'export' | 'export-flow' | 'init' | 'app' | 'workspace';
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
