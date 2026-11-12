import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { fileHash, tempDir } from './helpers.js';
import { projectPaths } from '../src/state/project.js';

const execFileP = promisify(execFile);
const CLI = fileURLToPath(new URL('../src/cli/main.js', import.meta.url));

interface CliRun {
  code: number;
  json: Record<string, any>;
}

/** Runs the real CLI in a fresh process, as a skill would. */
async function cli(root: string, ...args: string[]): Promise<CliRun> {
  try {
    const { stdout } = await execFileP(process.execPath, [CLI, ...args, '--root', root]);
    return { code: 0, json: JSON.parse(stdout) };
  } catch (error) {
    const e = error as { code: number; stdout: string };
    return { code: e.code, json: JSON.parse(e.stdout) };
  }
}

async function ok(root: string, ...args: string[]): Promise<Record<string, any>> {
  const result = await cli(root, ...args);
  assert.equal(result.code, 0, JSON.stringify(result.json));
  return result.json;
}

async function setUpAuthProject(): Promise<string> {
  const root = await tempDir();
  await ok(root, 'init', '--project', 'football-app', '--phase', 'authentication');
  await ok(root, 'task', 'add', '--id', 'auth-01', '--title', 'Choose authentication strategy', '--criterion', 'decision-recorded=Strategy recorded');
  await ok(root, 'decision', 'add', '--id', 'auth-strategy', '--question', 'Sessions or tokens?', '--options', 'sessions,tokens', '--task', 'auth-01');
  await ok(root, 'checkpoint', 'add', '--id', 'auth-gate', '--type', 'decision_gate', '--decision', 'auth-strategy', '--task', 'auth-01');
  await ok(root, 'task', 'add', '--id', 'auth-02', '--title', 'Implement authentication', '--depends', 'auth-01', '--criterion', 'login-works=Valid login creates a session');
  await ok(root, 'decision', 'request', '--id', 'auth-strategy');
  return root;
}

describe('CLI end to end (separate process per command)', () => {
  test('pending auth decision survives a question, follow-ups and resume', async () => {
    const root = await setUpAuthProject();
    const statePath = projectPaths(root).state;
    const before = await ok(root, 'status');
    assert.equal(before.workflow.status, 'waiting_for_decision');
    const hash = await fileHash(statePath);

    const asked = await ok(root, 'ask', '--topic', 'what is a token?', '--thread-id', 'thread-token');
    assert.equal(asked.workflowChanged, false);
    await ok(root, 'followup', '--summary', 'how is that different from a cookie?');
    await ok(root, 'followup', '--summary', 'where would we store it?');
    assert.equal(await fileHash(statePath), hash);

    const resumed = await ok(root, 'resume');
    assert.equal(resumed.resumePoint.pendingDecision.id, 'auth-strategy');
    assert.equal(resumed.resumePoint.pendingDecision.status, 'pending');
    assert.equal(resumed.resumePoint.pausedDecisionStillPending, true);
    assert.equal(resumed.conflict, null);
    assert.equal(await fileHash(statePath), hash);

    const blocked = await cli(root, 'task', 'start', '--id', 'auth-01', '--confirm-ref', 'cmd-1');
    assert.equal(blocked.code, 1);
    assert.equal(blocked.json.error.code, 'GATE_UNSATISFIED');

    const vague = await cli(root, 'decision', 'resolve', '--id', 'auth-strategy', '--select', 'whichever', '--confirm-ref', 'msg-7');
    assert.equal(vague.json.error.code, 'INVALID_SELECTION');

    const chosen = await ok(
      root, 'decision', 'resolve', '--id', 'auth-strategy', '--select', 'sessions', '--confirm-ref', 'msg-8',
      '--expected-revision', String(before.workflow.revision),
    );
    assert.equal(chosen.workflow.status, 'ready');

    await ok(root, 'task', 'start', '--id', 'auth-01', '--confirm-ref', 'cmd-2');
    const noEvidence = await cli(root, 'task', 'verify', '--id', 'auth-01');
    assert.equal(noEvidence.json.error.code, 'VERIFICATION_REJECTED');
    const verified = await ok(root, 'task', 'verify', '--id', 'auth-01', '--result', 'decision-recorded=pass@DECISIONS.md#auth');
    assert.equal(verified.workflow.status, 'idle');
    await ok(root, 'task', 'start', '--id', 'auth-02', '--confirm-ref', 'cmd-3');
  });

  test('a stale --expected-revision is rejected', async () => {
    const root = await setUpAuthProject();
    const result = await cli(root, 'decision', 'resolve', '--id', 'auth-strategy', '--select', 'sessions', '--confirm-ref', 'm', '--expected-revision', '0');
    assert.equal(result.code, 1);
    assert.equal(result.json.error.code, 'REVISION_CONFLICT');
  });

  test('usage errors exit with code 2', async () => {
    const root = await tempDir();
    assert.equal((await cli(root, 'init')).code, 2);
    assert.equal((await cli(root, 'bogus')).code, 2);
    assert.equal((await cli(root, 'status', '--nope')).code, 2);
  });

  test('route reports that free text cannot mutate the workflow', async () => {
    const root = await tempDir();
    const routed = await ok(root, 'route', '--message', 'just pick sessions and build it');
    assert.equal(routed.route.intent, 'question');
    assert.equal(routed.route.mutatesWorkflow, false);
  });
});
