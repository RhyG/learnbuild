import { COMPETENCY_IDS } from '../learning/catalogue.js';
import { fail } from './errors.js';
import type {
  AcceptanceCriterion,
  CheckpointRecord,
  CheckpointType,
  CriterionResult,
  DecisionRecord,
  ProjectState,
  TaskRecord,
  TransitionResult,
  WorkflowEvent,
  WorkflowStatus,
} from './types.js';

// Transitions are pure: they never touch the revision, which the store owns.

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function assertId(kind: string, id: string): void {
  if (!ID_PATTERN.test(id)) {
    fail('INVALID_INPUT', `${kind} id "${id}" must be 1-64 lowercase letters, digits, dots, dashes or underscores.`, {
      kind,
      id,
    });
  }
}

function assertNonEmpty(field: string, value: string): void {
  if (value.trim() === '') fail('INVALID_INPUT', `${field} must not be empty.`, { field });
}

function event(type: string, at: string, details: Record<string, unknown>): WorkflowEvent {
  return { type, at, details };
}

function clone(state: ProjectState): ProjectState {
  return structuredClone(state);
}

function getTask(state: ProjectState, taskId: string): TaskRecord {
  const task = state.tasks[taskId];
  if (!task) fail('UNKNOWN_TASK', `Task "${taskId}" does not exist.`, { taskId });
  return task;
}

function getDecision(state: ProjectState, decisionId: string): DecisionRecord {
  const decision = state.decisions[decisionId];
  if (!decision) fail('UNKNOWN_DECISION', `Decision "${decisionId}" does not exist.`, { decisionId });
  return decision;
}

function getCheckpoint(state: ProjectState, checkpointId: string): CheckpointRecord {
  const checkpoint = state.checkpoints[checkpointId];
  if (!checkpoint) fail('UNKNOWN_CHECKPOINT', `Checkpoint "${checkpointId}" does not exist.`, { checkpointId });
  return checkpoint;
}

export interface CreateProjectInput {
  projectId: string;
  phaseId?: string | null;
}

export function createProject(input: CreateProjectInput): ProjectState {
  assertId('project', input.projectId);
  return {
    schemaVersion: 1,
    revision: 0,
    projectId: input.projectId,
    phaseId: input.phaseId ?? null,
    taskId: null,
    status: 'idle',
    pendingDecisionId: null,
    tasks: {},
    decisions: {},
    checkpoints: {},
  };
}

export interface AddDecisionInput {
  id: string;
  question: string;
  options: string[];
  taskId?: string;
  at: string;
}

export function addDecision(state: ProjectState, input: AddDecisionInput): TransitionResult<ProjectState> {
  assertId('decision', input.id);
  assertNonEmpty('question', input.question);
  if (state.decisions[input.id]) fail('DUPLICATE_ID', `Decision "${input.id}" already exists.`, { id: input.id });
  if (input.options.length < 2) fail('INVALID_INPUT', 'A decision needs at least two options.', { id: input.id });
  for (const option of input.options) assertId('option', option);
  if (new Set(input.options).size !== input.options.length) {
    fail('INVALID_INPUT', 'Decision options must be unique.', { options: input.options });
  }
  if (input.taskId !== undefined) getTask(state, input.taskId);

  const next = clone(state);
  const decision: DecisionRecord = {
    id: input.id,
    question: input.question,
    options: [...input.options],
    status: 'pending',
  };
  if (input.taskId !== undefined) decision.taskId = input.taskId;
  next.decisions[input.id] = decision;
  return { state: next, events: [event('decision_added', input.at, { decisionId: input.id })] };
}

export interface AddCheckpointInput {
  id: string;
  type: CheckpointType;
  blocking: boolean;
  decisionId?: string;
  /** Attaches the checkpoint to this task's gates. */
  taskId?: string;
  at: string;
}

export function addCheckpoint(state: ProjectState, input: AddCheckpointInput): TransitionResult<ProjectState> {
  assertId('checkpoint', input.id);
  if (state.checkpoints[input.id]) fail('DUPLICATE_ID', `Checkpoint "${input.id}" already exists.`, { id: input.id });
  if (input.type === 'decision_gate') {
    if (input.decisionId === undefined) fail('INVALID_INPUT', 'A decision_gate checkpoint needs a decisionId.');
    if (!input.blocking) fail('INVALID_INPUT', 'A decision_gate checkpoint is always blocking.');
    getDecision(state, input.decisionId);
  } else if (input.decisionId !== undefined) {
    fail('INVALID_INPUT', 'Only decision_gate checkpoints reference a decision.');
  }
  if (input.type === 'learning_opportunity' && input.blocking) {
    fail('INVALID_INPUT', 'A learning_opportunity checkpoint cannot be blocking.');
  }
  if (input.taskId !== undefined) {
    const task = getTask(state, input.taskId);
    if (task.status === 'executing' || task.status === 'complete') {
      fail('INVALID_TRANSITION', `Cannot add a gate to task "${task.id}" while it is ${task.status}.`);
    }
  }

  const next = clone(state);
  const checkpoint: CheckpointRecord = {
    id: input.id,
    type: input.type,
    blocking: input.blocking,
    status: 'pending',
  };
  if (input.decisionId !== undefined) {
    checkpoint.decisionId = input.decisionId;
    if (state.decisions[input.decisionId]?.status === 'resolved') checkpoint.status = 'satisfied';
  }
  next.checkpoints[input.id] = checkpoint;
  if (input.taskId !== undefined) getTask(next, input.taskId).checkpointIds.push(input.id);
  refreshReadiness(next);
  return {
    state: next,
    events: [event('checkpoint_added', input.at, { checkpointId: input.id, type: input.type, taskId: input.taskId ?? null })],
  };
}

export interface AddTaskInput {
  id: string;
  title: string;
  dependencies?: string[];
  checkpointIds?: string[];
  acceptanceCriteria?: AcceptanceCriterion[];
  competencyIds?: string[];
  at: string;
}

export function addTask(state: ProjectState, input: AddTaskInput): TransitionResult<ProjectState> {
  assertId('task', input.id);
  assertNonEmpty('title', input.title);
  if (state.tasks[input.id]) fail('DUPLICATE_ID', `Task "${input.id}" already exists.`, { id: input.id });
  const dependencies = input.dependencies ?? [];
  const checkpointIds = input.checkpointIds ?? [];
  const acceptanceCriteria = input.acceptanceCriteria ?? [];
  // Dependencies must already exist, which rules out cycles without a graph search.
  for (const dep of dependencies) getTask(state, dep);
  for (const cp of checkpointIds) getCheckpoint(state, cp);
  const criterionIds = new Set<string>();
  for (const criterion of acceptanceCriteria) {
    assertId('criterion', criterion.id);
    assertNonEmpty('criterion description', criterion.description);
    if (criterionIds.has(criterion.id)) fail('DUPLICATE_ID', `Criterion "${criterion.id}" is repeated.`);
    criterionIds.add(criterion.id);
  }

  const next = clone(state);
  next.tasks[input.id] = {
    id: input.id,
    title: input.title,
    dependencies: [...dependencies],
    checkpointIds: [...checkpointIds],
    acceptanceCriteria: acceptanceCriteria.map((c) => ({ ...c })),
    status: 'pending',
    verifications: [],
  };
  if (input.competencyIds && input.competencyIds.length > 0) {
    for (const id of input.competencyIds) {
      if (!COMPETENCY_IDS.has(id)) fail('INVALID_INPUT', `Unknown competency "${id}".`, { competencyId: id });
    }
    next.tasks[input.id]!.competencyIds = [...input.competencyIds];
  }
  if (next.status === 'idle' || next.status === 'complete') next.status = 'planning';
  return { state: next, events: [event('task_added', input.at, { taskId: input.id })] };
}

export interface GateReport {
  satisfied: boolean;
  unmet: string[];
  deferrable: string[];
}

export function evaluateTaskGates(state: ProjectState, taskId: string): GateReport {
  const task = getTask(state, taskId);
  const unmet: string[] = [];
  const deferrable: string[] = [];
  for (const dep of task.dependencies) {
    if (state.tasks[dep]?.status !== 'complete') unmet.push(`dependency:${dep}`);
  }
  for (const cpId of task.checkpointIds) {
    const cp = getCheckpoint(state, cpId);
    if (cp.status === 'satisfied') continue;
    if (cp.blocking) unmet.push(`checkpoint:${cpId}`);
    else if (cp.status === 'pending') deferrable.push(cpId);
  }
  return { satisfied: unmet.length === 0, unmet, deferrable };
}

function statusFromGates(report: GateReport, state: ProjectState): WorkflowStatus {
  if (report.satisfied) return 'ready';
  const waitingOnEvidence = report.unmet.every((reason) => {
    const id = reason.slice('checkpoint:'.length);
    return reason.startsWith('checkpoint:') && state.checkpoints[id]?.type === 'understanding_gate';
  });
  return waitingOnEvidence ? 'waiting_for_evidence' : 'blocked';
}

export interface RequestDecisionInput {
  decisionId: string;
  at: string;
}

export function requestDecision(state: ProjectState, input: RequestDecisionInput): TransitionResult<ProjectState> {
  const decision = getDecision(state, input.decisionId);
  if (decision.status !== 'pending') {
    fail('DECISION_NOT_PENDING', `Decision "${input.decisionId}" is already resolved.`, {
      decisionId: input.decisionId,
    });
  }
  if (state.status === 'executing') {
    fail('INVALID_TRANSITION', 'Cannot present a decision while a task is executing.', { taskId: state.taskId });
  }
  const next = clone(state);
  next.pendingDecisionId = decision.id;
  next.status = 'waiting_for_decision';
  if (decision.taskId !== undefined) {
    next.taskId = decision.taskId;
    const task = getTask(next, decision.taskId);
    if (task.status === 'pending') task.status = 'active';
  }
  return { state: next, events: [event('decision_requested', input.at, { decisionId: decision.id })] };
}

export interface ResolveDecisionInput {
  decisionId: string;
  selection: string;
  /** Reference to the explicit learner message or command that made the choice. */
  confirmationRef: string;
  at: string;
}

export function resolveDecision(state: ProjectState, input: ResolveDecisionInput): TransitionResult<ProjectState> {
  if (input.confirmationRef.trim() === '') {
    fail('CONFIRMATION_REQUIRED', 'Resolving a decision needs a reference to the explicit learner choice.');
  }
  if (state.pendingDecisionId === null) {
    fail('DECISION_NOT_PENDING', 'No decision is waiting for an answer.', { decisionId: input.decisionId });
  }
  if (state.pendingDecisionId !== input.decisionId) {
    fail('DECISION_MISMATCH', `The pending decision is "${state.pendingDecisionId}", not "${input.decisionId}".`, {
      pendingDecisionId: state.pendingDecisionId,
      decisionId: input.decisionId,
    });
  }
  const decision = getDecision(state, input.decisionId);
  if (decision.status !== 'pending') {
    fail('DECISION_NOT_PENDING', `Decision "${input.decisionId}" is already resolved.`);
  }
  if (!decision.options.includes(input.selection)) {
    fail('INVALID_SELECTION', `"${input.selection}" is not one of the options for "${decision.id}".`, {
      options: decision.options,
      selection: input.selection,
    });
  }

  const next = clone(state);
  const resolved = getDecision(next, decision.id);
  resolved.status = 'resolved';
  resolved.selection = input.selection;
  resolved.evidenceRef = input.confirmationRef;
  resolved.resolvedAt = input.at;
  const satisfied: string[] = [];
  for (const cp of Object.values(next.checkpoints)) {
    if (cp.type === 'decision_gate' && cp.decisionId === decision.id) {
      cp.status = 'satisfied';
      cp.evidenceRef = input.confirmationRef;
      satisfied.push(cp.id);
    }
  }
  next.pendingDecisionId = null;
  next.status = next.taskId !== null ? statusFromGates(evaluateTaskGates(next, next.taskId), next) : 'idle';
  return {
    state: next,
    events: [
      event('decision_resolved', input.at, {
        decisionId: decision.id,
        selection: input.selection,
        confirmationRef: input.confirmationRef,
        satisfiedCheckpoints: satisfied,
      }),
    ],
  };
}

export interface SatisfyCheckpointInput {
  checkpointId: string;
  /** Reference to recorded learner evidence, such as an evidence id. */
  evidenceRef: string;
  at: string;
}

export function satisfyCheckpoint(state: ProjectState, input: SatisfyCheckpointInput): TransitionResult<ProjectState> {
  const cp = getCheckpoint(state, input.checkpointId);
  if (cp.type === 'decision_gate') {
    fail('INVALID_TRANSITION', 'A decision_gate is satisfied only by resolving its decision.', {
      checkpointId: cp.id,
      decisionId: cp.decisionId,
    });
  }
  if (input.evidenceRef.trim() === '') fail('INVALID_INPUT', 'Satisfying a checkpoint needs an evidence reference.');
  const next = clone(state);
  const updated = getCheckpoint(next, cp.id);
  updated.status = 'satisfied';
  updated.evidenceRef = input.evidenceRef;
  delete updated.deferredReason;
  refreshReadiness(next);
  return {
    state: next,
    events: [event('checkpoint_satisfied', input.at, { checkpointId: cp.id, evidenceRef: input.evidenceRef })],
  };
}

export interface DeferCheckpointInput {
  checkpointId: string;
  reason: string;
  at: string;
}

export function deferCheckpoint(state: ProjectState, input: DeferCheckpointInput): TransitionResult<ProjectState> {
  const cp = getCheckpoint(state, input.checkpointId);
  if (cp.blocking) {
    fail('INVALID_TRANSITION', `Checkpoint "${cp.id}" is required and cannot be deferred.`, { checkpointId: cp.id });
  }
  if (cp.status === 'satisfied') fail('INVALID_TRANSITION', `Checkpoint "${cp.id}" is already satisfied.`);
  assertNonEmpty('reason', input.reason);
  const next = clone(state);
  const updated = getCheckpoint(next, cp.id);
  updated.status = 'deferred';
  updated.deferredReason = input.reason;
  return { state: next, events: [event('checkpoint_deferred', input.at, { checkpointId: cp.id, reason: input.reason })] };
}

function refreshReadiness(state: ProjectState): void {
  if (state.taskId === null || state.pendingDecisionId !== null) return;
  if (state.status === 'executing' || state.status === 'verifying') return;
  state.status = statusFromGates(evaluateTaskGates(state, state.taskId), state);
}

export interface SelectTaskInput {
  taskId: string;
  at: string;
}

/** Points the workflow at a task without starting it. */
export function selectTask(state: ProjectState, input: SelectTaskInput): TransitionResult<ProjectState> {
  const task = getTask(state, input.taskId);
  if (task.status === 'complete') fail('INVALID_TRANSITION', `Task "${task.id}" is already complete.`);
  if (state.status === 'executing' || state.pendingDecisionId !== null) {
    fail('INVALID_TRANSITION', 'Finish the executing task or pending decision before selecting another task.', {
      taskId: state.taskId,
      pendingDecisionId: state.pendingDecisionId,
    });
  }
  const next = clone(state);
  next.taskId = task.id;
  const selected = getTask(next, task.id);
  if (selected.status === 'pending') selected.status = 'active';
  refreshReadiness(next);
  return { state: next, events: [event('task_selected', input.at, { taskId: task.id })] };
}

export interface StartTaskInput {
  taskId: string;
  /** Reference to the explicit command that authorised execution. */
  authorisationRef: string;
  at: string;
}

export function startTask(state: ProjectState, input: StartTaskInput): TransitionResult<ProjectState> {
  if (input.authorisationRef.trim() === '') {
    fail('CONFIRMATION_REQUIRED', 'Starting a task needs a reference to an explicit instruction.');
  }
  const task = getTask(state, input.taskId);
  if (task.status === 'complete' || task.status === 'executing') {
    fail('INVALID_TRANSITION', `Task "${task.id}" is ${task.status}.`, { taskId: task.id, status: task.status });
  }
  if (state.status === 'executing' && state.taskId !== task.id) {
    fail('INVALID_TRANSITION', `Task "${state.taskId}" is already executing.`, { executingTaskId: state.taskId });
  }
  if (state.pendingDecisionId !== null) {
    fail('GATE_UNSATISFIED', `Decision "${state.pendingDecisionId}" is still waiting for an answer.`, {
      unmet: [`decision:${state.pendingDecisionId}`],
    });
  }
  const gates = evaluateTaskGates(state, task.id);
  if (!gates.satisfied) {
    fail('GATE_UNSATISFIED', `Task "${task.id}" cannot start until its gates are satisfied.`, { unmet: gates.unmet });
  }

  const next = clone(state);
  const started = getTask(next, task.id);
  started.status = 'executing';
  started.startedBy = input.authorisationRef;
  next.taskId = task.id;
  next.status = 'executing';
  return {
    state: next,
    events: [
      event('task_started', input.at, {
        taskId: task.id,
        authorisationRef: input.authorisationRef,
        optionalCheckpointsPending: gates.deferrable,
      }),
    ],
  };
}

export interface VerifyTaskInput {
  taskId: string;
  results: CriterionResult[];
  at: string;
}

/**
 * Records verification evidence. The task completes only when every acceptance
 * criterion has a passing result with an evidence reference; a failing run is
 * recorded and the task stays executing.
 */
export function verifyTask(state: ProjectState, input: VerifyTaskInput): TransitionResult<ProjectState> {
  const task = getTask(state, input.taskId);
  if (task.status !== 'executing') {
    fail('INVALID_TRANSITION', `Task "${task.id}" is ${task.status}; only an executing task can be verified.`);
  }
  if (task.acceptanceCriteria.length === 0) {
    fail('VERIFICATION_REJECTED', `Task "${task.id}" has no acceptance criteria to verify against.`);
  }
  const known = new Set(task.acceptanceCriteria.map((c) => c.id));
  const seen = new Set<string>();
  for (const result of input.results) {
    if (!known.has(result.criterionId)) {
      fail('VERIFICATION_REJECTED', `"${result.criterionId}" is not an acceptance criterion of "${task.id}".`);
    }
    if (seen.has(result.criterionId)) fail('VERIFICATION_REJECTED', `"${result.criterionId}" is reported twice.`);
    if (result.evidenceRef.trim() === '') {
      fail('VERIFICATION_REJECTED', `Result for "${result.criterionId}" has no evidence reference.`);
    }
    seen.add(result.criterionId);
  }
  const missing = [...known].filter((id) => !seen.has(id));
  if (missing.length > 0) {
    fail('VERIFICATION_REJECTED', `No evidence for acceptance criteria: ${missing.join(', ')}.`, { missing });
  }

  const accepted = input.results.every((r) => r.outcome === 'pass');
  const next = clone(state);
  const verified = getTask(next, task.id);
  verified.verifications.push({ at: input.at, results: input.results.map((r) => ({ ...r })), accepted });
  if (accepted) {
    verified.status = 'complete';
    next.taskId = null;
    next.status = Object.values(next.tasks).every((t) => t.status === 'complete') ? 'complete' : 'idle';
  }
  return {
    state: next,
    events: [
      event(accepted ? 'task_verified' : 'task_verification_failed', input.at, {
        taskId: task.id,
        failed: input.results.filter((r) => r.outcome === 'fail').map((r) => r.criterionId),
      }),
    ],
  };
}

export interface PlanInput {
  phaseId?: string;
  tasks: {
    id: string;
    title: string;
    dependencies?: string[];
    acceptanceCriteria: AcceptanceCriterion[];
    competencyIds?: string[];
  }[];
  decisions?: { id: string; question: string; options: string[]; taskId: string }[];
  checkpoints?: { id: string; type: CheckpointType; blocking?: boolean; decisionId?: string; taskId: string }[];
}

/**
 * Adds a whole plan in one transition, so a plan with any invalid part
 * changes nothing. Every task needs at least one acceptance criterion,
 * because a task without one could never be verified.
 */
export function applyPlan(state: ProjectState, plan: PlanInput, at: string): TransitionResult<ProjectState> {
  if (state.status === 'executing') fail('INVALID_TRANSITION', 'Finish the task in progress before changing the plan.');
  if (plan.tasks.length === 0) fail('INVALID_INPUT', 'A plan needs at least one task.');
  let next = state;
  const events: WorkflowEvent[] = [];
  const step = (result: TransitionResult<ProjectState>): void => {
    next = result.state;
    events.push(...result.events);
  };
  for (const task of plan.tasks) {
    if (task.acceptanceCriteria.length === 0) {
      fail('INVALID_INPUT', `Task "${task.id}" needs at least one acceptance criterion.`, { taskId: task.id });
    }
    const input: AddTaskInput = { id: task.id, title: task.title, acceptanceCriteria: task.acceptanceCriteria, at };
    if (task.dependencies) input.dependencies = task.dependencies;
    if (task.competencyIds) input.competencyIds = task.competencyIds;
    step(addTask(next, input));
  }
  for (const decision of plan.decisions ?? []) step(addDecision(next, { ...decision, at }));
  for (const checkpoint of plan.checkpoints ?? []) {
    const input: AddCheckpointInput = {
      id: checkpoint.id,
      type: checkpoint.type,
      blocking: checkpoint.type === 'decision_gate' ? true : (checkpoint.blocking ?? checkpoint.type === 'understanding_gate'),
      taskId: checkpoint.taskId,
      at,
    };
    if (checkpoint.decisionId !== undefined) input.decisionId = checkpoint.decisionId;
    step(addCheckpoint(next, input));
  }
  if (plan.phaseId !== undefined) {
    assertId('phase', plan.phaseId);
    next = { ...next, phaseId: plan.phaseId };
  }
  return { state: next, events };
}

export type NextAction =
  | { action: 'plan' }
  | { action: 'done' }
  | { action: 'await_decision'; decision: DecisionRecord }
  | { action: 'request_decision'; taskId: string; decisionId: string }
  | { action: 'await_evidence'; taskId: string; checkpointIds: string[] }
  | { action: 'start_task'; task: TaskRecord; optionalCheckpointIds: string[] }
  | { action: 'continue_task'; task: TaskRecord }
  | { action: 'blocked'; reason: string };

/** Works out the single next step without changing anything. */
export function nextAction(state: ProjectState): NextAction {
  if (state.status === 'executing' && state.taskId !== null) {
    return { action: 'continue_task', task: getTask(state, state.taskId) };
  }
  if (state.pendingDecisionId !== null) {
    return { action: 'await_decision', decision: getDecision(state, state.pendingDecisionId) };
  }
  const tasks = Object.values(state.tasks);
  if (tasks.length === 0) return { action: 'plan' };
  if (tasks.every((t) => t.status === 'complete')) return { action: 'done' };
  const task = tasks.find(
    (t) => t.status !== 'complete' && t.dependencies.every((dep) => state.tasks[dep]?.status === 'complete'),
  );
  if (!task) return { action: 'blocked', reason: 'Every remaining task depends on a task that is not complete.' };
  const gates = evaluateTaskGates(state, task.id);
  if (gates.satisfied) return { action: 'start_task', task, optionalCheckpointIds: gates.deferrable };
  const pending = gates.unmet.map((reason) => state.checkpoints[reason.slice('checkpoint:'.length)]).filter((cp) => cp !== undefined);
  const decisionGate = pending.find((cp) => cp.type === 'decision_gate' && cp.decisionId !== undefined);
  if (decisionGate?.decisionId !== undefined) {
    return { action: 'request_decision', taskId: task.id, decisionId: decisionGate.decisionId };
  }
  return { action: 'await_evidence', taskId: task.id, checkpointIds: pending.map((cp) => cp.id) };
}
