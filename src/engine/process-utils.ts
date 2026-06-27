import { execSync } from 'child_process';

export function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /PID ${pid} /T /F`);
    } catch {
      // process already gone
    }
    return;
  }

  try {
    process.kill(-pid);
  } catch (e: any) {
    if (e?.code !== 'ESRCH') {
      try {
        process.kill(pid);
      } catch {
        // process already gone
      }
    }
  }
}
