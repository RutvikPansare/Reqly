import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface RunningLock {
  pid: number;
  projectDir: string;
  port: number;
  startedAt: string;
}

export const LOCK_PATH = path.join(os.homedir(), '.reqly', 'running.json');

export async function writeLock(projectDir: string, port: number): Promise<void> {
  const lock: RunningLock = {
    pid: process.pid,
    projectDir,
    port,
    startedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(LOCK_PATH), { recursive: true });
  await fs.writeFile(LOCK_PATH, JSON.stringify(lock, null, 2));
}

export async function readLock(): Promise<RunningLock | null> {
  try {
    const data = await fs.readFile(LOCK_PATH, 'utf-8');
    return JSON.parse(data) as RunningLock;
  } catch (e: any) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export async function clearLock(): Promise<void> {
  try {
    await fs.unlink(LOCK_PATH);
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
