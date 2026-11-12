import { randomBytes } from 'node:crypto';
import { open, readFile, stat, unlink } from 'node:fs/promises';
import { hostname } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { LearnBuildError } from '../domain/errors.js';

export interface LockOptions {
  /** How long to wait for another writer before failing. */
  timeoutMs?: number;
  /** Age after which a lock is treated as abandoned even if its owner looks alive. */
  staleMs?: number;
  retryMs?: number;
}

interface LockInfo {
  pid: number;
  host: string;
  token: string;
  createdAt: number;
}

export interface LockHandle {
  release(): Promise<void>;
}

/**
 * Cross-process exclusive lock using an O_EXCL lock file. A lock is reclaimed
 * when its owner process on this host has exited or it is older than staleMs.
 */
export async function acquireLock(lockPath: string, options: LockOptions = {}): Promise<LockHandle> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const staleMs = options.staleMs ?? 30_000;
  const retryMs = options.retryMs ?? 15;
  const info: LockInfo = {
    pid: process.pid,
    host: hostname(),
    token: randomBytes(8).toString('hex'),
    createdAt: Date.now(),
  };
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      const handle = await open(lockPath, 'wx', 0o644);
      try {
        await handle.writeFile(JSON.stringify(info));
      } finally {
        await handle.close();
      }
      return { release: () => releaseLock(lockPath, info.token) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }

    if ((await isStale(lockPath, staleMs)) && (await reclaim(lockPath, staleMs))) continue;
    if (Date.now() >= deadline) {
      throw new LearnBuildError('LOCK_TIMEOUT', `Another LearnBuild process holds ${lockPath}. Try again shortly.`, {
        lockPath,
        timeoutMs,
      });
    }
    await delay(retryMs + Math.floor(Math.random() * retryMs));
  }
}

async function readLockInfo(lockPath: string): Promise<LockInfo | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(lockPath, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null) return parsed as LockInfo;
  } catch {
    // Missing, or written but not yet flushed by its owner.
  }
  return null;
}

async function isStale(lockPath: string, staleMs: number): Promise<boolean> {
  const info = await readLockInfo(lockPath);
  if (info === null) return false;
  if (Date.now() - info.createdAt > staleMs) return true;
  return info.host === hostname() && !processAlive(info.pid);
}

const RECLAIM_ABANDONED_MS = 5000;

/**
 * Removes a stale lock while holding a second O_EXCL file, then re-checks
 * staleness under it. Without this, two waiters could both judge the lock
 * stale and the slower one would delete the lock the faster one had just taken.
 * Returns false when another process is reclaiming, so the caller waits.
 */
async function reclaim(lockPath: string, staleMs: number): Promise<boolean> {
  const reclaimPath = `${lockPath}.reclaim`;
  let handle;
  try {
    handle = await open(reclaimPath, 'wx', 0o644);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    // Another process is reclaiming. Clear its marker only if it crashed mid-reclaim.
    const info = await stat(reclaimPath).catch(() => null);
    if (info !== null && Date.now() - info.mtimeMs > RECLAIM_ABANDONED_MS) {
      await unlink(reclaimPath).catch(() => undefined);
    }
    return false;
  }
  try {
    await handle.close();
    if (await isStale(lockPath, staleMs)) await unlink(lockPath).catch(() => undefined);
    return true;
  } finally {
    await unlink(reclaimPath).catch(() => undefined);
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function releaseLock(lockPath: string, token: string): Promise<void> {
  const info = await readLockInfo(lockPath);
  if (info?.token === token) await unlink(lockPath).catch(() => undefined);
}
