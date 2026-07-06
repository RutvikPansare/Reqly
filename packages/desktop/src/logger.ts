import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// File logger for the desktop shell. Everything interesting (server spawn,
// renderer crashes, load failures, watchdog actions) lands in
// ~/.reqly/desktop.log so a user reporting "the window went blank" can attach
// a real trace instead of a screenshot.

const LOG_DIR = path.join(os.homedir(), '.reqly');
export const LOG_PATH = path.join(LOG_DIR, 'desktop.log');
const MAX_LOG_BYTES = 1024 * 1024; // rotate to desktop.log.1 past 1 MB

function rotateIfNeeded(): void {
  try {
    if (fs.statSync(LOG_PATH).size > MAX_LOG_BYTES) {
      fs.renameSync(LOG_PATH, `${LOG_PATH}.1`);
    }
  } catch {
    // No log file yet - nothing to rotate.
  }
}

function write(level: 'info' | 'warn' | 'error', message: string): void {
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    rotateIfNeeded();
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch {
    // Logging must never take the app down with it.
  }
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const log = {
  info: (message: string) => write('info', message),
  warn: (message: string) => write('warn', message),
  error: (message: string) => write('error', message),
};
