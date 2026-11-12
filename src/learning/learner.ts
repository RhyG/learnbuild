import { fail } from '../domain/errors.js';
import type { TransitionResult } from '../domain/types.js';
import { assertId } from '../domain/workflow.js';
import { COMPETENCY_IDS } from './catalogue.js';

export const LEARNING_MODES = ['guided', 'hands_on', 'accelerated'] as const;
export type LearningMode = (typeof LEARNING_MODES)[number];

export const EVIDENCE_TYPES = ['introduced', 'explained', 'predicted', 'modified', 'debugged', 'transferred'] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export type CompetencyLevel = 0 | 1 | 2 | 3;
export type Assessor = 'learner' | 'agent' | 'human';
export type Confidence = 'low' | 'medium' | 'high';

export interface CompetencyEvidence {
  id: string;
  competencyId: string;
  type: EvidenceType;
  levelCandidate: CompetencyLevel;
  sourceRef: string;
  assessedAt: string;
  assessor: Assessor;
  confidence: Confidence;
  /** Marks evidence that the learner's understanding is lower than previously assessed. */
  contradicts?: boolean;
}

export interface LearnerDocument {
  schemaVersion: 1;
  revision: number;
  learnerId: string;
  mode: LearningMode;
  evidence: CompetencyEvidence[];
}

/** Highest level each evidence type can support on its own. */
export const EVIDENCE_LEVEL_CAP: Readonly<Record<EvidenceType, CompetencyLevel>> = {
  introduced: 0,
  explained: 1,
  predicted: 2,
  modified: 2,
  debugged: 3,
  transferred: 3,
};

export function createLearnerDocument(learnerId = 'local-default'): LearnerDocument {
  return { schemaVersion: 1, revision: 0, learnerId, mode: 'guided', evidence: [] };
}

function effectiveLevel(e: CompetencyEvidence): CompetencyLevel {
  // Self-report ("I understand") and low-confidence judgements never raise proficiency.
  if (e.assessor === 'learner') return 0;
  const capped = Math.min(e.levelCandidate, EVIDENCE_LEVEL_CAP[e.type]) as CompetencyLevel;
  return e.confidence === 'low' ? (Math.min(capped, 1) as CompetencyLevel) : capped;
}

export interface Proficiency {
  competencyId: string;
  level: CompetencyLevel;
  evidenceRefs: string[];
}

/**
 * Derives a competency level from evidence in chronological order.
 * Supporting evidence can raise the level up to its cap; contradicting
 * evidence lowers it to what was actually shown.
 */
export function proficiency(doc: LearnerDocument, competencyId: string): Proficiency {
  const relevant = doc.evidence
    .filter((e) => e.competencyId === competencyId)
    .sort((a, b) => a.assessedAt.localeCompare(b.assessedAt));
  let level: CompetencyLevel = 0;
  for (const e of relevant) {
    const shown = effectiveLevel(e);
    if (e.contradicts) level = Math.min(level, shown) as CompetencyLevel;
    else level = Math.max(level, shown) as CompetencyLevel;
  }
  return { competencyId, level, evidenceRefs: relevant.map((e) => e.id) };
}

export interface RecordEvidenceInput extends Omit<CompetencyEvidence, 'contradicts'> {
  contradicts?: boolean;
}

export function recordEvidence(doc: LearnerDocument, input: RecordEvidenceInput): TransitionResult<LearnerDocument> {
  assertId('evidence', input.id);
  if (!COMPETENCY_IDS.has(input.competencyId)) {
    fail('INVALID_INPUT', `Unknown competency "${input.competencyId}".`, { competencyId: input.competencyId });
  }
  if (doc.evidence.some((e) => e.id === input.id)) fail('DUPLICATE_ID', `Evidence "${input.id}" already exists.`);
  if (input.sourceRef.trim() === '') fail('INVALID_INPUT', 'Evidence needs a source reference.');
  const before = proficiency(doc, input.competencyId).level;
  const next = structuredClone(doc);
  const record: CompetencyEvidence = { ...input };
  if (!input.contradicts) delete record.contradicts;
  next.evidence.push(record);
  const after = proficiency(next, input.competencyId).level;
  return {
    state: next,
    events: [
      {
        type: 'evidence_recorded',
        at: input.assessedAt,
        details: { evidenceId: input.id, competencyId: input.competencyId, levelBefore: before, levelAfter: after },
      },
    ],
  };
}

export function setMode(doc: LearnerDocument, mode: LearningMode, at: string): TransitionResult<LearnerDocument> {
  if (!LEARNING_MODES.includes(mode)) fail('INVALID_INPUT', `Mode must be one of ${LEARNING_MODES.join(', ')}.`);
  const next = structuredClone(doc);
  next.mode = mode;
  return { state: next, events: [{ type: 'mode_changed', at, details: { from: doc.mode, to: mode } }] };
}

export interface ParticipationRules {
  learnerWritesSelectedCode: boolean;
  incrementalHints: boolean;
  /** Default for new understanding gates; decision gates and verification are unaffected by mode. */
  understandingGatesBlockByDefault: boolean;
}

export function participationRules(mode: LearningMode): ParticipationRules {
  switch (mode) {
    case 'guided':
      return { learnerWritesSelectedCode: false, incrementalHints: false, understandingGatesBlockByDefault: true };
    case 'hands_on':
      return { learnerWritesSelectedCode: true, incrementalHints: true, understandingGatesBlockByDefault: true };
    case 'accelerated':
      return { learnerWritesSelectedCode: false, incrementalHints: false, understandingGatesBlockByDefault: false };
  }
}
