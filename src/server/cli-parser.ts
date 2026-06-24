import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ParsedArgs {
  command: 'start' | 'run' | 'setup';
  args: string[];
  flags: {
    env?: string;
    reporter?: string;
    projectDir?: string;
  };
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
  const validCommands = ['start', 'run', 'setup'];
  let commandFound = false;

  while (i < args.length) {
    const arg = args[i];
    
    if (arg === '--env') {
      result.flags.env = args[++i];
    } else if (arg === '--reporter') {
      result.flags.reporter = args[++i];
    } else if (arg === '--project-dir') {
      result.flags.projectDir = args[++i];
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
        result.command = arg as 'start' | 'run' | 'setup';
        commandFound = true;
      } else {
        result.args.push(arg);
      }
    }
    i++;
  }

  return result;
}
