import { readLock, clearLock, isProcessAlive } from './lock.js';

export async function handleStopCommand(): Promise<number> {
  const lock = await readLock();

  if (!lock || !isProcessAlive(lock.pid)) {
    if (lock) await clearLock();
    console.log('No Reqly instance running.');
    return 0;
  }

  try {
    await fetch(`http://localhost:${lock.port}/api/shutdown`, { method: 'POST' });
  } catch (e) {
    // server may have already gone down; fall through to clear the lock
  }

  await clearLock();
  return 0;
}
