import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LearnBuildError } from '../src/domain/errors.js';
import { resolveDecision, startTask } from '../src/domain/workflow.js';
import { routeMessage } from '../src/router/router.js';
import type { ProjectRepository } from '../src/state/project.js';
import { addFollowUp, openQuestion, switchThread } from '../src/threads/threads.js';
import { AT, authProject, fileHash, snapshotTree } from './helpers.js';

async function ask(repo: ProjectRepository, threadId: string, text: string, parentId: string | null = null) {
  const route = routeMessage(text);
  assert.equal(route.mutatesWorkflow, false);
  assert.deepEqual(route.permittedOperations, ['open_or_continue_thread']);
  return repo.updateThreads((threads, workflow) =>
    openQuestion(threads, workflow, { threadId, topic: text, summary: text, ref: `msg-${threadId}`, parentId, at: AT }),
  );
}

async function followUp(repo: ProjectRepository, text: string, ref: string, threadId?: string) {
  assert.equal(routeMessage(text).mutatesWorkflow, false);
  return repo.updateThreads((threads) =>
    addFollowUp(threads, threadId === undefined ? { ref, summary: text, at: AT } : { threadId, ref, summary: text, at: AT }),
  );
}

describe('T01 question does not decide or execute', () => {
  test('"what is a token?" opens a thread and leaves workflow state byte-identical', async () => {
    const repo = await authProject();
    const before = await repo.workflow.read();
    const stateHash = await fileHash(repo.paths.state);
    const tree = await snapshotTree(repo.paths.root, (rel) => rel.includes('threads') || rel.endsWith('events.jsonl'));

    const { doc } = await ask(repo, 'thread-token', 'what is a token?');

    assert.equal(await fileHash(repo.paths.state), stateHash);
    assert.deepEqual(await snapshotTree(repo.paths.root, (rel) => rel.includes('threads') || rel.endsWith('events.jsonl')), tree);
    const after = await repo.workflow.read();
    assert.deepEqual(after, before);
    assert.equal(after.pendingDecisionId, 'auth-strategy');
    assert.equal(after.decisions['auth-strategy']?.status, 'pending');
    assert.equal(after.tasks['auth-01']?.status, 'active');

    const thread = doc.threads['thread-token'];
    assert.equal(doc.activeThreadId, 'thread-token');
    assert.equal(thread?.pausedDecisionId, 'auth-strategy');
    assert.equal(thread?.pausedTaskId, 'auth-01');
    assert.equal(thread?.pausedWorkflowRevision, before.revision);
  });
});

describe('T02 follow-ups preserve discussion', () => {
  test('two follow-ups land in the same thread and workflow is unchanged', async () => {
    const repo = await authProject();
    const stateHash = await fileHash(repo.paths.state);
    await ask(repo, 'thread-token', 'what is a token?');
    await followUp(repo, 'how is that different from a cookie?', 'msg-2');
    const { doc } = await followUp(repo, 'where would we store it?', 'msg-3');

    assert.equal(Object.keys(doc.threads).length, 1);
    assert.deepEqual(doc.threads['thread-token']?.entries.map((e) => e.ref), ['msg-thread-token', 'msg-2', 'msg-3']);
    assert.equal(await fileHash(repo.paths.state), stateHash);
  });

  test('a follow-up with no open thread is rejected rather than guessed', async () => {
    const repo = await authProject();
    await assert.rejects(followUp(repo, 'why?', 'msg-1'), (e: unknown) => e instanceof LearnBuildError && e.code === 'NO_ACTIVE_THREAD');
  });
});

describe('T03 resume restores pending decision', () => {
  test('/learn-resume closes the thread and returns the still-pending decision', async () => {
    const repo = await authProject();
    const stateHash = await fileHash(repo.paths.state);
    await ask(repo, 'thread-token', 'what is a token?');
    await followUp(repo, 'how is that different from a cookie?', 'msg-2');
    await followUp(repo, 'where would we store it?', 'msg-3');

    const route = routeMessage('/learn-resume');
    assert.equal(route.intent, 'resume');
    assert.equal(route.mutatesWorkflow, false);

    const outcome = await repo.resume(AT);
    assert.deepEqual(outcome.closedThreadIds, ['thread-token']);
    assert.equal(outcome.conflict, null);
    assert.equal(outcome.resumePoint.pendingDecision?.id, 'auth-strategy');
    assert.equal(outcome.resumePoint.pendingDecision?.status, 'pending');
    assert.equal(outcome.resumePoint.pausedDecisionStillPending, true);
    assert.equal(outcome.resumePoint.taskId, 'auth-01');
    assert.equal(await fileHash(repo.paths.state), stateHash);

    const threads = await repo.threads.read();
    assert.equal(threads.activeThreadId, null);
    assert.equal(threads.threads['thread-token']?.status, 'closed');

    const workflow = await repo.workflow.read();
    assert.throws(() => startTask(workflow, { taskId: 'auth-01', authorisationRef: 'cmd', at: AT }));
  });

  test('resume reports a conflict when the workflow moved while the thread was open', async () => {
    const repo = await authProject();
    await ask(repo, 'thread-token', 'what is a token?');
    await repo.updateWorkflow((s) =>
      resolveDecision(s, { decisionId: 'auth-strategy', selection: 'tokens', confirmationRef: 'other-session', at: AT }),
    );
    const outcome = await repo.resume(AT);
    assert.notEqual(outcome.conflict, null);
    assert.equal(outcome.conflict?.pausedWorkflowRevision, 1);
    assert.equal(outcome.conflict?.currentWorkflowRevision, 2);
    assert.ok(outcome.conflict?.changes.some((c) => c.startsWith('pendingDecisionId')));
    assert.equal(outcome.resumePoint.pausedDecisionStillPending, false);
  });

  test('after resume, only an explicit decision advances the workflow', async () => {
    const repo = await authProject();
    await ask(repo, 'thread-token', 'what is a token?');
    await repo.resume(AT);
    const { doc } = await repo.updateWorkflow(
      (s) => resolveDecision(s, { decisionId: 'auth-strategy', selection: 'sessions', confirmationRef: 'msg-9', at: AT }),
      { expectedRevision: 1 },
    );
    assert.equal(doc.status, 'ready');
    assert.equal(doc.revision, 2);
  });
});

describe('T05 code example is not a code edit', () => {
  test('asking for a hypothetical implementation opens a thread and authorises nothing', async () => {
    const repo = await authProject();
    const tree = await snapshotTree(repo.paths.root, (rel) => rel.includes('threads') || rel.endsWith('events.jsonl'));
    const text = 'show me what a token implementation would look like';
    const route = routeMessage(text);
    assert.equal(route.intent, 'question');
    assert.equal(route.mutatesWorkflow, false);
    assert.ok(!route.permittedOperations.includes('start_task'));

    await ask(repo, 'thread-example', text);
    assert.deepEqual(await snapshotTree(repo.paths.root, (rel) => rel.includes('threads') || rel.endsWith('events.jsonl')), tree);
    const workflow = await repo.workflow.read();
    assert.equal(workflow.tasks['auth-02']?.status, 'pending');
    assert.equal(workflow.status, 'waiting_for_decision');
  });

  test('a classifier that thinks a message is a decision cannot make it one', () => {
    const route = routeMessage("let's just go with sessions I guess", { intent: 'decision', confidence: 0.99 });
    assert.equal(route.mutatesWorkflow, false);
    assert.equal(route.confirmationNeededFor, 'decision');
    assert.ok(!route.permittedOperations.includes('resolve_decision'));
  });
});

describe('T06 nested or switched topics', () => {
  test('auth question, unrelated Git question, then return to auth keeps the checkpoint recoverable', async () => {
    const repo = await authProject();
    const stateHash = await fileHash(repo.paths.state);
    await ask(repo, 'thread-token', 'what is a token?');
    const git = await ask(repo, 'thread-git', 'what does git rebase do?');
    assert.equal(git.doc.threads['thread-token']?.status, 'suspended');
    assert.equal(git.doc.activeThreadId, 'thread-git');
    assert.equal(git.doc.threads['thread-git']?.pausedDecisionId, 'auth-strategy');

    const back = await repo.updateThreads((threads) => switchThread(threads, { threadId: 'thread-token', at: AT }));
    assert.equal(back.doc.activeThreadId, 'thread-token');
    assert.equal(back.doc.threads['thread-git']?.status, 'suspended');

    await followUp(repo, 'so where does the token go?', 'msg-4');
    const threads = await repo.threads.read();
    assert.equal(threads.threads['thread-token']?.entries.length, 2);
    assert.equal(threads.threads['thread-git']?.entries.length, 1);

    const outcome = await repo.resume(AT);
    assert.deepEqual(outcome.closedThreadIds.sort(), ['thread-git', 'thread-token']);
    assert.equal(outcome.resumePoint.pendingDecision?.id, 'auth-strategy');
    assert.equal(await fileHash(repo.paths.state), stateHash);
  });

  test('a nested question records its parent thread', async () => {
    const repo = await authProject();
    await ask(repo, 'thread-token', 'what is a token?');
    const { doc } = await ask(repo, 'thread-jwt', 'what is a JWT signature?', 'thread-token');
    assert.equal(doc.threads['thread-jwt']?.parentId, 'thread-token');
  });
});
