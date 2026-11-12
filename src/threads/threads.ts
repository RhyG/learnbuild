import { fail } from '../domain/errors.js';
import type {
  DecisionRecord,
  LearningThread,
  ProjectState,
  ThreadsDocument,
  TransitionResult,
  WorkflowEvent,
  WorkflowStatus,
} from '../domain/types.js';
import { assertId } from '../domain/workflow.js';

// Thread operations read ProjectState but can only return a ThreadsDocument,
// so a question has no code path that mutates the workflow.

export function createThreadsDocument(): ThreadsDocument {
  return { schemaVersion: 1, revision: 0, activeThreadId: null, threads: {} };
}

function getThread(doc: ThreadsDocument, threadId: string): LearningThread {
  const thread = doc.threads[threadId];
  if (!thread) fail('UNKNOWN_THREAD', `Thread "${threadId}" does not exist.`, { threadId });
  return thread;
}

function event(type: string, at: string, details: Record<string, unknown>): WorkflowEvent {
  return { type, at, details };
}

export interface OpenQuestionInput {
  threadId: string;
  topic: string;
  ref: string;
  /** Short summary of the question; full transcripts are not stored. */
  summary: string;
  parentId?: string | null;
  at: string;
}

/** Opens a learning thread and suspends any currently active one. */
export function openQuestion(
  doc: ThreadsDocument,
  workflow: Readonly<ProjectState>,
  input: OpenQuestionInput,
): TransitionResult<ThreadsDocument> {
  assertId('thread', input.threadId);
  if (input.topic.trim() === '') fail('INVALID_INPUT', 'A learning thread needs a topic.');
  if (doc.threads[input.threadId]) fail('DUPLICATE_ID', `Thread "${input.threadId}" already exists.`);
  const parentId = input.parentId ?? null;
  if (parentId !== null) getThread(doc, parentId);

  const next = structuredClone(doc);
  const previous = next.activeThreadId;
  if (previous !== null) getThread(next, previous).status = 'suspended';
  next.threads[input.threadId] = {
    id: input.threadId,
    parentId,
    topic: input.topic,
    status: 'active',
    pausedWorkflowRevision: workflow.revision,
    pausedTaskId: workflow.taskId,
    pausedDecisionId: workflow.pendingDecisionId,
    pausedStatus: workflow.status,
    entries: [{ ref: input.ref, summary: input.summary, at: input.at }],
    openedAt: input.at,
  };
  next.activeThreadId = input.threadId;
  return {
    state: next,
    events: [
      event('thread_opened', input.at, {
        threadId: input.threadId,
        parentId,
        suspendedThreadId: previous,
        pausedWorkflowRevision: workflow.revision,
      }),
    ],
  };
}

export interface FollowUpInput {
  threadId?: string;
  ref: string;
  summary: string;
  at: string;
}

export function addFollowUp(doc: ThreadsDocument, input: FollowUpInput): TransitionResult<ThreadsDocument> {
  const threadId = input.threadId ?? doc.activeThreadId;
  if (threadId === null) fail('NO_ACTIVE_THREAD', 'There is no active learning thread for this follow-up.');
  const thread = getThread(doc, threadId);
  if (thread.status === 'closed') fail('INVALID_TRANSITION', `Thread "${threadId}" is closed.`, { threadId });

  const next = structuredClone(doc);
  const updated = getThread(next, threadId);
  if (next.activeThreadId !== threadId) {
    if (next.activeThreadId !== null) getThread(next, next.activeThreadId).status = 'suspended';
    next.activeThreadId = threadId;
  }
  updated.status = 'active';
  updated.entries.push({ ref: input.ref, summary: input.summary, at: input.at });
  return { state: next, events: [event('thread_followup', input.at, { threadId, ref: input.ref })] };
}

export interface SwitchThreadInput {
  threadId: string;
  at: string;
}

/** Returns to an earlier, suspended thread. */
export function switchThread(doc: ThreadsDocument, input: SwitchThreadInput): TransitionResult<ThreadsDocument> {
  const thread = getThread(doc, input.threadId);
  if (thread.status === 'closed') fail('INVALID_TRANSITION', `Thread "${input.threadId}" is closed.`);
  const next = structuredClone(doc);
  const previous = next.activeThreadId;
  if (previous !== null && previous !== input.threadId) getThread(next, previous).status = 'suspended';
  getThread(next, input.threadId).status = 'active';
  next.activeThreadId = input.threadId;
  return {
    state: next,
    events: [event('thread_switched', input.at, { threadId: input.threadId, suspendedThreadId: previous })],
  };
}

export interface ResumeConflict {
  pausedWorkflowRevision: number;
  currentWorkflowRevision: number;
  changes: string[];
}

export interface ResumePoint {
  taskId: string | null;
  status: WorkflowStatus;
  workflowRevision: number;
  pendingDecision: DecisionRecord | null;
  /** True when the decision paused by the thread is still waiting for an answer. */
  pausedDecisionStillPending: boolean;
}

export interface ResumeOutcome extends TransitionResult<ThreadsDocument> {
  closedThreadIds: string[];
  resumePoint: ResumePoint;
  conflict: ResumeConflict | null;
}

/**
 * Closes open learning threads and reports where the workflow stands. It
 * authorises nothing: the pending decision stays pending.
 */
export function resume(doc: ThreadsDocument, workflow: Readonly<ProjectState>, at: string): ResumeOutcome {
  const anchorId = doc.activeThreadId ?? latestOpenThreadId(doc);
  const anchor = anchorId === null ? null : getThread(doc, anchorId);

  const next = structuredClone(doc);
  const closedThreadIds: string[] = [];
  for (const thread of Object.values(next.threads)) {
    if (thread.status !== 'closed') {
      thread.status = 'closed';
      thread.closedAt = at;
      closedThreadIds.push(thread.id);
    }
  }
  next.activeThreadId = null;

  const pendingDecision =
    workflow.pendingDecisionId === null ? null : structuredClone(workflow.decisions[workflow.pendingDecisionId] ?? null);

  let conflict: ResumeConflict | null = null;
  if (anchor !== null && anchor.pausedWorkflowRevision !== workflow.revision) {
    const changes: string[] = [];
    if (anchor.pausedTaskId !== workflow.taskId) changes.push(`taskId: ${anchor.pausedTaskId} -> ${workflow.taskId}`);
    if (anchor.pausedDecisionId !== workflow.pendingDecisionId) {
      changes.push(`pendingDecisionId: ${anchor.pausedDecisionId} -> ${workflow.pendingDecisionId}`);
    }
    if (anchor.pausedStatus !== workflow.status) changes.push(`status: ${anchor.pausedStatus} -> ${workflow.status}`);
    conflict = {
      pausedWorkflowRevision: anchor.pausedWorkflowRevision,
      currentWorkflowRevision: workflow.revision,
      changes,
    };
  }

  const pausedDecisionStillPending =
    anchor?.pausedDecisionId != null && anchor.pausedDecisionId === workflow.pendingDecisionId;

  return {
    state: next,
    events: [event('threads_resumed', at, { closedThreadIds, workflowRevision: workflow.revision, conflict })],
    closedThreadIds,
    resumePoint: {
      taskId: workflow.taskId,
      status: workflow.status,
      workflowRevision: workflow.revision,
      pendingDecision,
      pausedDecisionStillPending,
    },
    conflict,
  };
}

function latestOpenThreadId(doc: ThreadsDocument): string | null {
  let latest: LearningThread | null = null;
  for (const thread of Object.values(doc.threads)) {
    if (thread.status === 'closed') continue;
    if (latest === null || thread.openedAt > latest.openedAt) latest = thread;
  }
  return latest?.id ?? null;
}
