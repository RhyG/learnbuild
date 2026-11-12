import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LearnBuildError } from '../src/domain/errors.js';
import { resolveDecision, startTask, verifyTask } from '../src/domain/workflow.js';
import { STARTER_COMPETENCIES } from '../src/learning/catalogue.js';
import {
  LEARNING_MODES,
  createLearnerDocument,
  participationRules,
  proficiency,
  recordEvidence,
  setMode,
  type LearnerDocument,
  type RecordEvidenceInput,
} from '../src/learning/learner.js';
import { learnerSchema, migrateAndValidate } from '../src/state/schema.js';
import { AT, authProject, authScenario, fileHash } from './helpers.js';

let seq = 0;
function evidence(doc: LearnerDocument, overrides: Partial<RecordEvidenceInput>): LearnerDocument {
  seq += 1;
  return recordEvidence(doc, {
    id: `ev-${seq}`,
    competencyId: 'authentication-vs-authorisation',
    type: 'explained',
    levelCandidate: 1,
    sourceRef: `thread-x/msg-${seq}`,
    assessedAt: `2026-11-12T00:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    assessor: 'agent',
    confidence: 'medium',
    ...overrides,
  }).state;
}

const level = (doc: LearnerDocument) => proficiency(doc, 'authentication-vs-authorisation').level;

describe('competency catalogue', () => {
  test('prerequisites exist and form no cycles', () => {
    const byId = new Map(STARTER_COMPETENCIES.map((c) => [c.id, c]));
    assert.equal(byId.size, 29);
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string): void => {
      assert.ok(byId.has(id), `unknown prerequisite ${id}`);
      if (done.has(id)) return;
      assert.ok(!visiting.has(id), `cycle through ${id}`);
      visiting.add(id);
      for (const p of byId.get(id)!.prerequisites) visit(p);
      visiting.delete(id);
      done.add(id);
    };
    for (const c of STARTER_COMPETENCIES) visit(c.id);
  });
});

describe('T11 no mastery for reading', () => {
  test('being introduced to a concept does not raise proficiency', () => {
    assert.equal(level(evidence(createLearnerDocument(), { type: 'introduced', levelCandidate: 3 })), 0);
  });

  test('"I understand" from the learner does not raise proficiency', () => {
    assert.equal(level(evidence(createLearnerDocument(), { type: 'transferred', levelCandidate: 3, assessor: 'learner' })), 0);
  });

  test('an explanation reaches level 1 at most, even when the candidate is higher', () => {
    assert.equal(level(evidence(createLearnerDocument(), { type: 'explained', levelCandidate: 3 })), 1);
  });

  test('low-confidence assessments cannot exceed level 1', () => {
    assert.equal(level(evidence(createLearnerDocument(), { type: 'debugged', levelCandidate: 3, confidence: 'low' })), 1);
  });

  test('demonstrated level needs debugging or transfer evidence', () => {
    let doc = evidence(createLearnerDocument(), { type: 'modified', levelCandidate: 3 });
    assert.equal(level(doc), 2);
    doc = evidence(doc, { type: 'transferred', levelCandidate: 3 });
    assert.equal(level(doc), 3);
  });

  test('contradicting evidence lowers proficiency', () => {
    let doc = evidence(createLearnerDocument(), { type: 'debugged', levelCandidate: 3 });
    doc = evidence(doc, { type: 'predicted', levelCandidate: 1, contradicts: true });
    assert.equal(level(doc), 1);
  });

  test('unknown competencies are rejected', () => {
    assert.throws(
      () => evidence(createLearnerDocument(), { competencyId: 'made-up' }),
      (e: unknown) => e instanceof LearnBuildError && e.code === 'INVALID_INPUT',
    );
  });
});

describe('T12 adaptive intensity', () => {
  test('modes change participation rules', () => {
    assert.equal(participationRules('hands_on').learnerWritesSelectedCode, true);
    assert.equal(participationRules('guided').learnerWritesSelectedCode, false);
    assert.equal(participationRules('accelerated').understandingGatesBlockByDefault, false);
  });

  test('no mode lets a task start past a pending decision', () => {
    for (const mode of LEARNING_MODES) {
      const learner = setMode(createLearnerDocument(), mode, AT).state;
      assert.equal(learner.mode, mode);
      // Gate checks take no learner input, so mode cannot reach them.
      assert.throws(() => startTask(authScenario(), { taskId: 'auth-01', authorisationRef: 'cmd', at: AT }));
    }
  });
});

describe('T13 separate project and learner progress', () => {
  test('completing a task leaves learner.json untouched and proficiency at 0', async () => {
    const repo = await authProject();
    const learnerHash = await fileHash(repo.paths.learner);
    await repo.updateWorkflow((s) => resolveDecision(s, { decisionId: 'auth-strategy', selection: 'sessions', confirmationRef: 'm', at: AT }));
    await repo.updateWorkflow((s) => startTask(s, { taskId: 'auth-01', authorisationRef: 'cmd', at: AT }));
    const { doc } = await repo.updateWorkflow((s) =>
      verifyTask(s, { taskId: 'auth-01', results: [{ criterionId: 'decision-recorded', outcome: 'pass', evidenceRef: 'log' }], at: AT }),
    );
    assert.equal(doc.tasks['auth-01']?.status, 'complete');
    assert.equal(await fileHash(repo.paths.learner), learnerHash);
    const learner = await repo.learner.read();
    assert.equal(proficiency(learner, 'authentication-vs-authorisation').level, 0);
  });

  test('recording evidence leaves workflow state untouched', async () => {
    const repo = await authProject();
    const stateHash = await fileHash(repo.paths.state);
    await repo.learner.update((l) =>
      recordEvidence(l, {
        id: 'ev-a',
        competencyId: 'authentication-vs-authorisation',
        type: 'predicted',
        levelCandidate: 2,
        sourceRef: 'thread-token/msg-3',
        assessedAt: AT,
        assessor: 'agent',
        confidence: 'high',
      }),
    );
    assert.equal(await fileHash(repo.paths.state), stateHash);
    assert.equal(proficiency(await repo.learner.read(), 'authentication-vs-authorisation').level, 2);
  });

  test('the learner example fixture validates', async () => {
    const raw: unknown = JSON.parse(await readFile(fileURLToPath(new URL('../../specs/learner.example.json', import.meta.url)), 'utf8'));
    const doc = migrateAndValidate(learnerSchema, raw);
    assert.equal(proficiency(doc, 'client-server-boundary').level, 2);
  });
});
