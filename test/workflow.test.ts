import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LearnBuildError, type ErrorCode } from '../src/domain/errors.js';
import type { ProjectState } from '../src/domain/types.js';
import {
  addCheckpoint,
  addTask,
  deferCheckpoint,
  evaluateTaskGates,
  resolveDecision,
  satisfyCheckpoint,
  selectTask,
  startTask,
  verifyTask,
} from '../src/domain/workflow.js';
import { projectStateSchema } from '../src/state/schema.js';
import { AT, authScenario } from './helpers.js';

function throwsCode(fn: () => unknown, code: ErrorCode): void {
  assert.throws(fn, (error: unknown) => error instanceof LearnBuildError && error.code === code);
}

function resolved(state: ProjectState = authScenario()): ProjectState {
  return resolveDecision(state, {
    decisionId: 'auth-strategy',
    selection: 'sessions',
    confirmationRef: 'msg-choose-sessions',
    at: AT,
  }).state;
}

describe('fixture', () => {
  test('auth scenario is a valid state and matches the spec fixture shape', () => {
    const state = authScenario();
    projectStateSchema.validate(state);
    assert.equal(state.status, 'waiting_for_decision');
    assert.equal(state.taskId, 'auth-01');
    assert.equal(state.pendingDecisionId, 'auth-strategy');
    assert.equal(state.tasks['auth-01']?.status, 'active');
  });
});

describe('T04 explicit decision advances correctly', () => {
  test('a valid explicit choice resolves the decision and readies the task', () => {
    const before = authScenario();
    const { state, events } = resolveDecision(before, {
      decisionId: 'auth-strategy',
      selection: 'sessions',
      confirmationRef: 'msg-choose-sessions',
      at: AT,
    });
    assert.equal(state.decisions['auth-strategy']?.status, 'resolved');
    assert.equal(state.decisions['auth-strategy']?.selection, 'sessions');
    assert.equal(state.decisions['auth-strategy']?.evidenceRef, 'msg-choose-sessions');
    assert.equal(state.checkpoints['auth-strategy-gate']?.status, 'satisfied');
    assert.equal(state.pendingDecisionId, null);
    assert.equal(state.status, 'ready');
    assert.equal(events[0]?.type, 'decision_resolved');
    assert.equal(before.pendingDecisionId, 'auth-strategy', 'input state must not be mutated');
  });

  for (const selection of ['maybe sessions?', 'Sessions', 'yes', 'whatever you think', '']) {
    test(`ambiguous or unrelated answer "${selection}" is rejected`, () => {
      throwsCode(
        () => resolveDecision(authScenario(), { decisionId: 'auth-strategy', selection, confirmationRef: 'm', at: AT }),
        'INVALID_SELECTION',
      );
    });
  }

  test('an answer to a different decision is rejected', () => {
    throwsCode(
      () => resolveDecision(authScenario(), { decisionId: 'db-choice', selection: 'sessions', confirmationRef: 'm', at: AT }),
      'DECISION_MISMATCH',
    );
  });

  test('a choice without a confirmation reference is rejected', () => {
    throwsCode(
      () => resolveDecision(authScenario(), { decisionId: 'auth-strategy', selection: 'sessions', confirmationRef: ' ', at: AT }),
      'CONFIRMATION_REQUIRED',
    );
  });

  test('a resolved decision cannot be resolved again', () => {
    throwsCode(
      () => resolveDecision(resolved(), { decisionId: 'auth-strategy', selection: 'tokens', confirmationRef: 'm', at: AT }),
      'DECISION_NOT_PENDING',
    );
  });

  test('dependent task unlocks only after the decision task is verified complete', () => {
    let state = resolved();
    throwsCode(() => startTask(state, { taskId: 'auth-02', authorisationRef: 'cmd', at: AT }), 'GATE_UNSATISFIED');
    state = startTask(state, { taskId: 'auth-01', authorisationRef: 'cmd-build', at: AT }).state;
    state = verifyTask(state, {
      taskId: 'auth-01',
      results: [{ criterionId: 'decision-recorded', outcome: 'pass', evidenceRef: 'DECISIONS.md#auth' }],
      at: AT,
    }).state;
    const started = startTask(state, { taskId: 'auth-02', authorisationRef: 'cmd-build-2', at: AT }).state;
    assert.equal(started.tasks['auth-02']?.status, 'executing');
    assert.equal(started.tasks['auth-02']?.startedBy, 'cmd-build-2');
    assert.equal(started.status, 'executing');
  });
});

describe('T09 required checkpoints block action', () => {
  test('a task gated by an unresolved decision cannot start', () => {
    const state = authScenario();
    assert.throws(
      () => startTask(state, { taskId: 'auth-01', authorisationRef: 'cmd', at: AT }),
      (error: unknown) =>
        error instanceof LearnBuildError &&
        error.code === 'GATE_UNSATISFIED' &&
        JSON.stringify(error.details).includes('auth-strategy'),
    );
  });

  test('a blocking understanding gate blocks until evidence satisfies it', () => {
    let state = resolved();
    state = addCheckpoint(state, {
      id: 'understand-sessions',
      type: 'understanding_gate',
      blocking: true,
      taskId: 'auth-01',
      at: AT,
    }).state;
    assert.equal(state.status, 'waiting_for_evidence');
    assert.deepEqual(evaluateTaskGates(state, 'auth-01').unmet, ['checkpoint:understand-sessions']);
    throwsCode(() => startTask(state, { taskId: 'auth-01', authorisationRef: 'cmd', at: AT }), 'GATE_UNSATISFIED');
    throwsCode(() => deferCheckpoint(state, { checkpointId: 'understand-sessions', reason: 'later', at: AT }), 'INVALID_TRANSITION');

    state = satisfyCheckpoint(state, { checkpointId: 'understand-sessions', evidenceRef: 'ev-003', at: AT }).state;
    assert.equal(state.status, 'ready');
    assert.equal(startTask(state, { taskId: 'auth-01', authorisationRef: 'cmd', at: AT }).state.status, 'executing');
  });

  test('a decision gate cannot be satisfied by evidence alone', () => {
    throwsCode(
      () => satisfyCheckpoint(authScenario(), { checkpointId: 'auth-strategy-gate', evidenceRef: 'ev', at: AT }),
      'INVALID_TRANSITION',
    );
  });

  test('a decision gate cannot be declared non-blocking', () => {
    throwsCode(
      () => addCheckpoint(authScenario(), { id: 'x', type: 'decision_gate', blocking: false, decisionId: 'auth-strategy', at: AT }),
      'INVALID_INPUT',
    );
  });

  test('an optional learning opportunity does not block and can be deferred with a record', () => {
    let state = resolved();
    state = addCheckpoint(state, {
      id: 'learn-csrf',
      type: 'learning_opportunity',
      blocking: false,
      taskId: 'auth-01',
      at: AT,
    }).state;
    const gates = evaluateTaskGates(state, 'auth-01');
    assert.equal(gates.satisfied, true);
    assert.deepEqual(gates.deferrable, ['learn-csrf']);

    const deferred = deferCheckpoint(state, { checkpointId: 'learn-csrf', reason: 'Learner wants momentum', at: AT });
    assert.equal(deferred.state.checkpoints['learn-csrf']?.status, 'deferred');
    assert.equal(deferred.state.checkpoints['learn-csrf']?.deferredReason, 'Learner wants momentum');
    assert.equal(deferred.events[0]?.type, 'checkpoint_deferred');

    const started = startTask(state, { taskId: 'auth-01', authorisationRef: 'cmd', at: AT });
    assert.deepEqual(started.events[0]?.details['optionalCheckpointsPending'], ['learn-csrf']);
  });

  test('starting needs an explicit authorisation reference', () => {
    throwsCode(() => startTask(resolved(), { taskId: 'auth-01', authorisationRef: '', at: AT }), 'CONFIRMATION_REQUIRED');
  });

  test('only one task executes at a time', () => {
    let state = resolved();
    state = addTask(state, { id: 'docs-01', title: 'Write README', at: AT }).state;
    state = startTask(state, { taskId: 'auth-01', authorisationRef: 'cmd', at: AT }).state;
    throwsCode(() => startTask(state, { taskId: 'docs-01', authorisationRef: 'cmd', at: AT }), 'INVALID_TRANSITION');
    throwsCode(() => selectTask(state, { taskId: 'docs-01', at: AT }), 'INVALID_TRANSITION');
  });
});

describe('T10 no false verification', () => {
  const executing = () => startTask(resolved(), { taskId: 'auth-01', authorisationRef: 'cmd', at: AT }).state;

  test('a task without recorded evidence for every criterion is not completed', () => {
    let state = resolved();
    state = startTask(state, { taskId: 'auth-01', authorisationRef: 'cmd', at: AT }).state;
    state = verifyTask(state, {
      taskId: 'auth-01',
      results: [{ criterionId: 'decision-recorded', outcome: 'pass', evidenceRef: 'log' }],
      at: AT,
    }).state;
    state = startTask(state, { taskId: 'auth-02', authorisationRef: 'cmd', at: AT }).state;
    throwsCode(
      () =>
        verifyTask(state, {
          taskId: 'auth-02',
          results: [{ criterionId: 'login-works', outcome: 'pass', evidenceRef: 'npm test' }],
          at: AT,
        }),
      'VERIFICATION_REJECTED',
    );
  });

  test('an empty claim of success is rejected', () => {
    throwsCode(() => verifyTask(executing(), { taskId: 'auth-01', results: [], at: AT }), 'VERIFICATION_REJECTED');
  });

  test('a result without an evidence reference is rejected', () => {
    throwsCode(
      () =>
        verifyTask(executing(), {
          taskId: 'auth-01',
          results: [{ criterionId: 'decision-recorded', outcome: 'pass', evidenceRef: '' }],
          at: AT,
        }),
      'VERIFICATION_REJECTED',
    );
  });

  test('unknown criteria are rejected', () => {
    throwsCode(
      () =>
        verifyTask(executing(), {
          taskId: 'auth-01',
          results: [
            { criterionId: 'decision-recorded', outcome: 'pass', evidenceRef: 'log' },
            { criterionId: 'made-up', outcome: 'pass', evidenceRef: 'log' },
          ],
          at: AT,
        }),
      'VERIFICATION_REJECTED',
    );
  });

  test('a failing result is recorded and the task stays executing', () => {
    const { state, events } = verifyTask(executing(), {
      taskId: 'auth-01',
      results: [{ criterionId: 'decision-recorded', outcome: 'fail', evidenceRef: 'review-1' }],
      at: AT,
    });
    assert.equal(state.tasks['auth-01']?.status, 'executing');
    assert.equal(state.tasks['auth-01']?.verifications.length, 1);
    assert.equal(state.tasks['auth-01']?.verifications[0]?.accepted, false);
    assert.equal(events[0]?.type, 'task_verification_failed');
  });

  test('a task with no acceptance criteria cannot be verified', () => {
    let state = resolved();
    state = addTask(state, { id: 'spike', title: 'Spike', at: AT }).state;
    state = startTask(state, { taskId: 'spike', authorisationRef: 'cmd', at: AT }).state;
    throwsCode(() => verifyTask(state, { taskId: 'spike', results: [], at: AT }), 'VERIFICATION_REJECTED');
  });

  test('a task that never started cannot be verified', () => {
    throwsCode(
      () =>
        verifyTask(resolved(), {
          taskId: 'auth-01',
          results: [{ criterionId: 'decision-recorded', outcome: 'pass', evidenceRef: 'log' }],
          at: AT,
        }),
      'INVALID_TRANSITION',
    );
  });

  test('the schema rejects a complete task with no accepted verification', () => {
    const state = resolved();
    state.tasks['auth-01']!.status = 'complete';
    throwsCode(() => projectStateSchema.validate(state), 'SCHEMA_INVALID');
  });
});

describe('planning validation', () => {
  test('dependencies must exist, so cycles cannot be created', () => {
    throwsCode(() => addTask(authScenario(), { id: 'x', title: 'X', dependencies: ['missing'], at: AT }), 'UNKNOWN_TASK');
  });

  test('ids are validated', () => {
    throwsCode(() => addTask(authScenario(), { id: '../etc', title: 'X', at: AT }), 'INVALID_INPUT');
  });

  test('duplicate ids are rejected', () => {
    throwsCode(() => addTask(authScenario(), { id: 'auth-01', title: 'X', at: AT }), 'DUPLICATE_ID');
  });
});
