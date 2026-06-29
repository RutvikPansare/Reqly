import { exec } from 'child_process';
import { readLock, isProcessAlive } from './lock.js';

function openInBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? `open "${url}"`
    : process.platform === 'win32' ? `start "" "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd);
}

export async function handleAppCommand(deps: { openUrl?: (url: string) => void } = {}): Promise<number> {
  const openUrl = deps.openUrl ?? openInBrowser;
  const lock = await readLock();

  if (!lock || !isProcessAlive(lock.pid)) {
    console.log('Reqly is not running. Start it with: reqly start');
    return 1;
  }

  openUrl(`http://localhost:${lock.port}`);
  return 0;
}
