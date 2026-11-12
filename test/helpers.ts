import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { after } from 'node:test';
import type { ProjectState } from '../src/domain/types.js';
import {
  addCheckpoint,
  addDecision,
  addTask,
  createProject,
  requestDecision,
} from '../src/domain/workflow.js';
import { initProject, type ProjectRepository } from '../src/state/project.js';
import type { LockOptions } from '../src/state/lock.js';

export const AT = '2026-11-12T00:00:00.000Z';

export async function tempDir(prefix = 'learnbuild-test-'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * The auth scenario from docs/PRODUCT.md: auth-01 waits on the auth-strategy
 * decision and auth-02 depends on auth-01.
 */
export function authScenario(): ProjectState {
  let s = createProject({ projectId: 'football-app', phaseId: 'authentication' });
  s = addTask(s, {
    id: 'auth-01',
    title: 'Choose authentication strategy',
    acceptanceCriteria: [{ id: 'decision-recorded', description: 'Strategy recorded in DECISIONS.md' }],
    at: AT,
  }).state;
  s = addDecision(s, {
    id: 'auth-strategy',
    question: 'Sessions or token-based authentication?',
    options: ['sessions', 'tokens'],
    taskId: 'auth-01',
    at: AT,
  }).state;
  s = addCheckpoint(s, {
    id: 'auth-strategy-gate',
    type: 'decision_gate',
    blocking: true,
    decisionId: 'auth-strategy',
    taskId: 'auth-01',
    at: AT,
  }).state;
  s = addTask(s, {
    id: 'auth-02',
    title: 'Implement authentication',
    dependencies: ['auth-01'],
    acceptanceCriteria: [
      { id: 'login-works', description: 'A valid login creates a session' },
      { id: 'bad-password-rejected', description: 'An invalid password returns 401' },
    ],
    at: AT,
  }).state;
  return requestDecision(s, { decisionId: 'auth-strategy', at: AT }).state;
}

/** Initialises a temp learner project and commits the auth scenario as revision 1. */
export async function authProject(lockOptions: LockOptions = {}): Promise<ProjectRepository> {
  const root = await tempDir();
  const repo = await initProject(root, { projectId: 'football-app', at: AT, lockOptions });
  const scenario = authScenario();
  await repo.updateWorkflow(() => ({ state: scenario, events: [] }));
  return repo;
}

/** Hashes every file under `dir` so tests can assert nothing changed. */
export async function snapshotTree(dir: string, exclude: (rel: string) => boolean = () => false): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      const rel = relative(dir, full);
      if (exclude(rel)) continue;
      if (entry.isDirectory()) await walk(full);
      else result.set(rel, createHash('sha256').update(await readFile(full)).digest('hex'));
    }
  }
  await walk(dir);
  return result;
}

export async function fileHash(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
