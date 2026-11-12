import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { access, readFile, readdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { LearnBuildError, type ErrorCode } from '../src/domain/errors.js';
import { addTask } from '../src/domain/workflow.js';
import { initProject, ProjectRepository } from '../src/state/project.js';
import { migrateAndValidate, projectStateSchema, threadsSchema, type DocumentSchema } from '../src/state/schema.js';
import { openQuestion } from '../src/threads/threads.js';
import { AT, authProject, fileHash, tempDir } from './helpers.js';

const run = promisify(execFile);
const RACE_WRITER = fileURLToPath(new URL('./fixtures/race-writer.js', import.meta.url));

function isCode(code: ErrorCode) {
  return (error: unknown) => error instanceof LearnBuildError && error.code === code;
}

async function waitFor(path: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await access(path);
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
      await delay(5);
    }
  }
}

function runWriter(args: string[]): Promise<{ ok: boolean; code?: string; revision?: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RACE_WRITER, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`writer exited ${code}: ${err}`));
      else resolve(JSON.parse(out) as { ok: boolean; code?: string; revision?: number });
    });
  });
}

async function race(repo: ProjectRepository, count: number, mode: 'expected' | 'serial') {
  const signals = await tempDir('learnbuild-signals-');
  const goFile = join(signals, 'go');
  const results = Array.from({ length: count }, (_, i) =>
    runWriter([repo.paths.root, join(signals, `ready-${i}`), goFile, mode, `race-${i}`]),
  );
  await Promise.all(Array.from({ length: count }, (_, i) => waitFor(join(signals, `ready-${i}`))));
  await writeFile(goFile, 'go');
  return Promise.all(results);
}

describe('T07 restart and compaction durability', () => {
  test('pending decision and thread pointers survive into a separate process', async () => {
    const repo = await authProject();
    await repo.updateThreads((threads, workflow) =>
      openQuestion(threads, workflow, { threadId: 'thread-token', topic: 'what is a token?', summary: 'what is a token?', ref: 'm1', at: AT }),
    );

    const script = `
      import { ProjectRepository } from ${JSON.stringify(new URL('../src/state/project.js', import.meta.url).href)};
      const repo = new ProjectRepository(process.argv[1]);
      const w = await repo.workflow.read();
      const t = await repo.threads.read();
      console.log(JSON.stringify({ pending: w.pendingDecisionId, status: w.status, revision: w.revision,
        active: t.activeThreadId, paused: t.threads[t.activeThreadId].pausedDecisionId }));`;
    const { stdout } = await run(process.execPath, ['--input-type=module', '-e', script, repo.paths.root]);
    assert.deepEqual(JSON.parse(stdout), {
      pending: 'auth-strategy',
      status: 'waiting_for_decision',
      revision: 1,
      active: 'thread-token',
      paused: 'auth-strategy',
    });
  });

  test('the event log records committed transitions with revisions', async () => {
    const repo = await authProject();
    await repo.updateWorkflow((s) => addTask(s, { id: 'extra', title: 'Extra', at: AT }));
    const lines = (await readFile(repo.paths.events, 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    assert.equal(lines[0]?.['type'], 'project_initialised');
    assert.equal(lines[0]?.['revision'], 0);
    assert.deepEqual(lines.at(-1), { document: 'state.json', revision: 2, type: 'task_added', at: AT, details: { taskId: 'extra' } });
  });
});

describe('T08 stale revision rejected', () => {
  test('a second in-process writer holding revision N gets REVISION_CONFLICT', async () => {
    const repo = await authProject();
    const seen = (await repo.workflow.read()).revision;
    await repo.updateWorkflow((s) => addTask(s, { id: 'first', title: 'First', at: AT }), { expectedRevision: seen });
    const hash = await fileHash(repo.paths.state);
    await assert.rejects(
      repo.updateWorkflow((s) => addTask(s, { id: 'second', title: 'Second', at: AT }), { expectedRevision: seen }),
      (e: unknown) => isCode('REVISION_CONFLICT')(e) && (e as LearnBuildError).details['currentRevision'] === seen + 1,
    );
    assert.equal(await fileHash(repo.paths.state), hash);
  });

  test('five processes that all read revision N: exactly one commits', async () => {
    const repo = await authProject();
    const results = await race(repo, 5, 'expected');
    assert.equal(results.filter((r) => r.ok).length, 1, JSON.stringify(results));
    assert.ok(results.filter((r) => !r.ok).every((r) => r.code === 'REVISION_CONFLICT'));
    const state = await repo.workflow.read();
    assert.equal(state.revision, 2);
    assert.equal(Object.keys(state.tasks).filter((id) => id.startsWith('race-')).length, 1);
  });

  test('five processes without an expected revision are serialised with no lost updates', async () => {
    const repo = await authProject();
    const results = await race(repo, 5, 'serial');
    assert.ok(results.every((r) => r.ok), JSON.stringify(results));
    const state = await repo.workflow.read();
    assert.equal(state.revision, 6);
    assert.equal(Object.keys(state.tasks).filter((id) => id.startsWith('race-')).length, 5);
  });

  test('a lock held by a live process times out with LOCK_TIMEOUT', async () => {
    const repo = await authProject({ timeoutMs: 100 });
    await writeFile(`${repo.paths.state}.lock`, JSON.stringify({ pid: process.pid, host: (await import('node:os')).hostname(), token: 'x', createdAt: Date.now() }));
    await assert.rejects(repo.updateWorkflow((s) => addTask(s, { id: 'x', title: 'X', at: AT })), isCode('LOCK_TIMEOUT'));
  });

  test('a lock left by a crashed process is reclaimed', async () => {
    const repo = await authProject({ timeoutMs: 2000 });
    const { stdout } = await run(process.execPath, ['-e', 'console.log(process.pid)']);
    const deadPid = Number(stdout.trim());
    const host = (await import('node:os')).hostname();
    await writeFile(`${repo.paths.state}.lock`, JSON.stringify({ pid: deadPid, host, token: 'x', createdAt: Date.now() }));
    const { doc } = await repo.updateWorkflow((s) => addTask(s, { id: 'after-crash', title: 'After crash', at: AT }));
    assert.equal(doc.revision, 2);
  });

  test('a stale lock is reclaimed by exactly one of five waiting processes at a time', async () => {
    const repo = await authProject();
    const { stdout } = await run(process.execPath, ['-e', 'console.log(process.pid)']);
    const host = (await import('node:os')).hostname();
    await writeFile(`${repo.paths.state}.lock`, JSON.stringify({ pid: Number(stdout.trim()), host, token: 'dead', createdAt: Date.now() }));
    const results = await race(repo, 5, 'serial');
    assert.ok(results.every((r) => r.ok), JSON.stringify(results));
    const state = await repo.workflow.read();
    assert.equal(state.revision, 6);
    assert.equal(Object.keys(state.tasks).filter((id) => id.startsWith('race-')).length, 5);
    assert.deepEqual((await readdir(repo.paths.stateDir)).filter((f) => f.includes('.lock')), []);
  });

  test('an abandoned reclaim marker does not block writers forever', async () => {
    const repo = await authProject({ timeoutMs: 3000 });
    const { stdout } = await run(process.execPath, ['-e', 'console.log(process.pid)']);
    const host = (await import('node:os')).hostname();
    await writeFile(`${repo.paths.state}.lock`, JSON.stringify({ pid: Number(stdout.trim()), host, token: 'dead', createdAt: Date.now() }));
    const marker = `${repo.paths.state}.lock.reclaim`;
    await writeFile(marker, '');
    const old = new Date(Date.now() - 60_000);
    await utimes(marker, old, old);
    const { doc } = await repo.updateWorkflow((s) => addTask(s, { id: 'x', title: 'X', at: AT }));
    assert.equal(doc.revision, 2);
  });

  test('temp files left by a crashed writer are removed by the next write', async () => {
    const repo = await authProject();
    const stray = join(repo.paths.stateDir, '.state.json.99999.abcdef.tmp');
    const unrelated = join(repo.paths.stateDir, '.learner.json.99999.abcdef.tmp');
    await writeFile(stray, '{"half":');
    await writeFile(unrelated, '{"half":');
    await repo.updateWorkflow((s) => addTask(s, { id: 'x', title: 'X', at: AT }));
    const files = await readdir(repo.paths.stateDir);
    assert.ok(!files.includes('.state.json.99999.abcdef.tmp'));
    assert.ok(files.includes('.learner.json.99999.abcdef.tmp'), 'another document\'s temp files are left to its own lock holder');
  });

  test('a lock older than staleMs is reclaimed', async () => {
    const repo = await authProject({ timeoutMs: 2000, staleMs: 1000 });
    await writeFile(`${repo.paths.state}.lock`, JSON.stringify({ pid: process.pid, host: 'other-host', token: 'x', createdAt: Date.now() - 5000 }));
    const { doc } = await repo.updateWorkflow((s) => addTask(s, { id: 'stale', title: 'Stale', at: AT }));
    assert.equal(doc.revision, 2);
  });
});

describe('schema and corruption handling', () => {
  test('invalid JSON is reported and never overwritten', async () => {
    const repo = await authProject();
    await writeFile(repo.paths.state, '{ "schemaVersion": 1, ');
    const hash = await fileHash(repo.paths.state);
    await assert.rejects(repo.workflow.read(), isCode('STATE_CORRUPT'));
    await assert.rejects(repo.updateWorkflow((s) => addTask(s, { id: 'x', title: 'X', at: AT })), isCode('STATE_CORRUPT'));
    assert.equal(await fileHash(repo.paths.state), hash);
  });

  test('a newer schema version is rejected and left untouched', async () => {
    const repo = await authProject();
    const raw = JSON.parse(await readFile(repo.paths.state, 'utf8')) as Record<string, unknown>;
    await writeFile(repo.paths.state, JSON.stringify({ ...raw, schemaVersion: 99 }));
    const hash = await fileHash(repo.paths.state);
    await assert.rejects(repo.updateWorkflow((s) => addTask(s, { id: 'x', title: 'X', at: AT })), isCode('UNSUPPORTED_SCHEMA_VERSION'));
    assert.equal(await fileHash(repo.paths.state), hash);
  });

  test('referential problems are reported', async () => {
    const repo = await authProject();
    const raw = JSON.parse(await readFile(repo.paths.state, 'utf8')) as Record<string, any>;
    raw['tasks']['auth-02']['dependencies'] = ['ghost'];
    raw['pendingDecisionId'] = 'nope';
    await writeFile(repo.paths.state, JSON.stringify(raw));
    await assert.rejects(repo.workflow.read(), (e: unknown) => {
      if (!isCode('SCHEMA_INVALID')(e)) return false;
      const problems = (e as LearnBuildError).details['problems'] as string[];
      return problems.some((p) => p.includes('ghost')) && problems.some((p) => p.includes('pendingDecisionId'));
    });
  });

  test('a transition that throws leaves the stored state and revision unchanged', async () => {
    const repo = await authProject();
    const hash = await fileHash(repo.paths.state);
    await assert.rejects(repo.updateWorkflow((s) => addTask(s, { id: 'auth-01', title: 'dup', at: AT })), isCode('DUPLICATE_ID'));
    assert.equal(await fileHash(repo.paths.state), hash);
    assert.equal((await repo.workflow.read()).revision, 1);
  });

  test('a transition producing an invalid state is not written', async () => {
    const repo = await authProject();
    const hash = await fileHash(repo.paths.state);
    await assert.rejects(
      repo.updateWorkflow((s) => ({ state: { ...s, pendingDecisionId: 'ghost' }, events: [] })),
      isCode('SCHEMA_INVALID'),
    );
    assert.equal(await fileHash(repo.paths.state), hash);
  });

  test('successful writes leave no temp or lock files behind', async () => {
    const repo = await authProject();
    await repo.updateWorkflow((s) => addTask(s, { id: 'x', title: 'X', at: AT }));
    const files = await readdir(repo.paths.stateDir);
    assert.deepEqual(files.filter((f) => f.endsWith('.tmp') || f.endsWith('.lock')), []);
  });

  test('migrations run in order and missing steps are rejected', () => {
    interface V3 { schemaVersion: number; revision: number; name: string; tags: string[] }
    const schema: DocumentSchema<V3> = {
      name: 'demo',
      currentVersion: 3,
      migrations: {
        1: (raw) => ({ ...raw, name: String(raw['title']) }),
        2: (raw) => ({ ...raw, tags: [] }),
      },
      validate: (raw) => raw as V3,
    };
    const migrated = migrateAndValidate(schema, { schemaVersion: 1, revision: 4, title: 'x' });
    assert.equal(migrated.schemaVersion, 3);
    assert.equal(migrated.name, 'x');
    assert.deepEqual(migrated.tags, []);
    assert.throws(() => migrateAndValidate({ ...schema, migrations: { 2: schema.migrations[2]! } }, { schemaVersion: 1, revision: 0 }), isCode('UNSUPPORTED_SCHEMA_VERSION'));
  });

  test('the example fixtures in specs/ validate against the current schemas', async () => {
    const load = async (name: string): Promise<unknown> =>
      JSON.parse(await readFile(fileURLToPath(new URL(`../../specs/${name}`, import.meta.url)), 'utf8'));
    const workflow = migrateAndValidate(projectStateSchema, await load('workflow.example.json'));
    assert.equal(workflow.pendingDecisionId, 'auth-strategy');
    const threads = migrateAndValidate(threadsSchema, await load('thread.example.json'));
    assert.equal(threads.threads['thread-token-question']?.pausedDecisionId, 'auth-strategy');
  });
});

describe('initialisation', () => {
  test('init refuses to overwrite an existing project', async () => {
    const root = await tempDir();
    await initProject(root, { projectId: 'a', at: AT });
    await assert.rejects(initProject(root, { projectId: 'b', at: AT }), isCode('STATE_EXISTS'));
    assert.equal((await new ProjectRepository(root).workflow.read()).projectId, 'a');
  });

  test('init refuses the LearnBuild framework source tree', async () => {
    const root = await tempDir();
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'learnbuild' }));
    await assert.rejects(initProject(root, { projectId: 'a', at: AT }), isCode('UNSAFE_ROOT'));
  });

  test('reading or writing a project that was never initialised gives STATE_NOT_FOUND', async () => {
    const root = await tempDir();
    const repo = new ProjectRepository(root);
    await assert.rejects(repo.workflow.read(), isCode('STATE_NOT_FOUND'));
    await assert.rejects(repo.updateWorkflow((s) => addTask(s, { id: 'x', title: 'X', at: AT })), isCode('STATE_NOT_FOUND'));
    await assert.rejects(repo.resume(AT), isCode('STATE_NOT_FOUND'));
    assert.deepEqual(await readdir(root), []);
  });
});
