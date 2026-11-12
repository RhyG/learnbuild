import { fail } from '../domain/errors.js';
import {
  CHECKPOINT_STATUSES,
  CHECKPOINT_TYPES,
  TASK_STATUSES,
  WORKFLOW_STATUSES,
  type ProjectState,
  type ThreadsDocument,
} from '../domain/types.js';
import { COMPETENCY_IDS } from '../learning/catalogue.js';
import { EVIDENCE_TYPES, LEARNING_MODES, type LearnerDocument } from '../learning/learner.js';
import { Validator } from './validate.js';

export interface VersionedDocument {
  schemaVersion: number;
  revision: number;
}

/**
 * Describes one persisted document type. `migrations[n]` upgrades a raw
 * version-n document to version n+1; loading applies them in order and
 * rejects versions newer than `currentVersion`.
 */
export interface DocumentSchema<T extends VersionedDocument> {
  name: string;
  currentVersion: number;
  migrations: Readonly<Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>>;
  validate(raw: unknown): T;
}

export function migrateAndValidate<T extends VersionedDocument>(schema: DocumentSchema<T>, raw: unknown): T {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    fail('SCHEMA_INVALID', `${schema.name} must be a JSON object.`);
  }
  let doc = raw as Record<string, unknown>;
  const version = doc['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    fail('SCHEMA_INVALID', `${schema.name} has no valid schemaVersion.`, { schemaVersion: version });
  }
  if (version > schema.currentVersion) {
    fail(
      'UNSUPPORTED_SCHEMA_VERSION',
      `${schema.name} uses schema version ${version}; this LearnBuild supports up to ${schema.currentVersion}. Upgrade LearnBuild before editing this project.`,
      { schemaVersion: version, supported: schema.currentVersion },
    );
  }
  for (let v = version; v < schema.currentVersion; v++) {
    const migrate = schema.migrations[v];
    if (!migrate) {
      fail('UNSUPPORTED_SCHEMA_VERSION', `No migration from ${schema.name} version ${v} to ${v + 1}.`, {
        schemaVersion: v,
      });
    }
    doc = { ...migrate(doc), schemaVersion: v + 1 };
  }
  return schema.validate(doc);
}

function validateProjectState(raw: unknown): ProjectState {
  const v = new Validator();
  if (!v.isObject('state', raw)) v.throwIfInvalid('state.json');
  const s = raw as Record<string, unknown>;

  if (s['schemaVersion'] !== 1) v.problem('schemaVersion', 'expected 1');
  v.integer('revision', s['revision']);
  v.string('projectId', s['projectId']);
  v.nullableString('phaseId', s['phaseId']);
  v.nullableString('taskId', s['taskId']);
  v.oneOf('status', s['status'], WORKFLOW_STATUSES);
  v.nullableString('pendingDecisionId', s['pendingDecisionId']);

  const tasks = s['tasks'];
  const decisions = s['decisions'];
  const checkpoints = s['checkpoints'];

  v.record('decisions', decisions, (key, item, path) => {
    if (!v.isObject(path, item)) return;
    if (item['id'] !== key) v.problem(`${path}.id`, 'must match its key');
    v.string(`${path}.question`, item['question']);
    v.stringArray(`${path}.options`, item['options']);
    v.oneOf(`${path}.status`, item['status'], ['pending', 'resolved'] as const);
    v.optionalString(`${path}.taskId`, item['taskId']);
    v.optionalString(`${path}.selection`, item['selection']);
    v.optionalString(`${path}.evidenceRef`, item['evidenceRef']);
    v.optionalString(`${path}.resolvedAt`, item['resolvedAt']);
    if (item['status'] === 'resolved') {
      const options = Array.isArray(item['options']) ? item['options'] : [];
      if (!options.includes(item['selection'])) v.problem(`${path}.selection`, 'resolved decision needs a valid selection');
      if (typeof item['evidenceRef'] !== 'string') v.problem(`${path}.evidenceRef`, 'resolved decision needs evidence');
    }
  });

  v.record('checkpoints', checkpoints, (key, item, path) => {
    if (!v.isObject(path, item)) return;
    if (item['id'] !== key) v.problem(`${path}.id`, 'must match its key');
    v.oneOf(`${path}.type`, item['type'], CHECKPOINT_TYPES);
    v.boolean(`${path}.blocking`, item['blocking']);
    v.oneOf(`${path}.status`, item['status'], CHECKPOINT_STATUSES);
    v.optionalString(`${path}.decisionId`, item['decisionId']);
    v.optionalString(`${path}.evidenceRef`, item['evidenceRef']);
    v.optionalString(`${path}.deferredReason`, item['deferredReason']);
    if (item['type'] === 'decision_gate') {
      if (item['blocking'] !== true) v.problem(`${path}.blocking`, 'decision_gate must be blocking');
      const decisionId = item['decisionId'];
      if (typeof decisionId !== 'string' || !hasKey(decisions, decisionId)) {
        v.problem(`${path}.decisionId`, 'must reference an existing decision');
      }
    }
    if (item['blocking'] === true && item['status'] === 'deferred') {
      v.problem(`${path}.status`, 'a blocking checkpoint cannot be deferred');
    }
  });

  v.record('tasks', tasks, (key, item, path) => {
    if (!v.isObject(path, item)) return;
    if (item['id'] !== key) v.problem(`${path}.id`, 'must match its key');
    v.string(`${path}.title`, item['title']);
    v.oneOf(`${path}.status`, item['status'], TASK_STATUSES);
    v.optionalString(`${path}.startedBy`, item['startedBy']);
    if (item['competencyIds'] !== undefined && v.stringArray(`${path}.competencyIds`, item['competencyIds'])) {
      for (const id of item['competencyIds']) {
        if (!COMPETENCY_IDS.has(id)) v.problem(`${path}.competencyIds`, `unknown competency "${id}"`);
      }
    }
    if (v.stringArray(`${path}.dependencies`, item['dependencies'])) {
      for (const dep of item['dependencies']) {
        if (!hasKey(tasks, dep)) v.problem(`${path}.dependencies`, `unknown task "${dep}"`);
      }
    }
    if (v.stringArray(`${path}.checkpointIds`, item['checkpointIds'])) {
      for (const cp of item['checkpointIds']) {
        if (!hasKey(checkpoints, cp)) v.problem(`${path}.checkpointIds`, `unknown checkpoint "${cp}"`);
      }
    }
    if (v.array(`${path}.acceptanceCriteria`, item['acceptanceCriteria'])) {
      item['acceptanceCriteria'].forEach((c, i) => {
        const cpath = `${path}.acceptanceCriteria[${i}]`;
        if (!v.isObject(cpath, c)) return;
        v.string(`${cpath}.id`, c['id']);
        v.string(`${cpath}.description`, c['description']);
      });
    }
    if (v.array(`${path}.verifications`, item['verifications'])) {
      item['verifications'].forEach((rec, i) => {
        const rpath = `${path}.verifications[${i}]`;
        if (!v.isObject(rpath, rec)) return;
        v.string(`${rpath}.at`, rec['at']);
        v.boolean(`${rpath}.accepted`, rec['accepted']);
        if (v.array(`${rpath}.results`, rec['results'])) {
          rec['results'].forEach((r, j) => {
            const p = `${rpath}.results[${j}]`;
            if (!v.isObject(p, r)) return;
            v.string(`${p}.criterionId`, r['criterionId']);
            v.oneOf(`${p}.outcome`, r['outcome'], ['pass', 'fail'] as const);
            v.string(`${p}.evidenceRef`, r['evidenceRef']);
          });
        }
      });
    }
    if (item['status'] === 'complete') {
      const verifications = Array.isArray(item['verifications']) ? item['verifications'] : [];
      const accepted = verifications.some((r) => typeof r === 'object' && r !== null && (r as Record<string, unknown>)['accepted'] === true);
      if (!accepted) v.problem(`${path}.status`, 'a complete task needs an accepted verification');
    }
  });

  const taskId = s['taskId'];
  if (typeof taskId === 'string' && !hasKey(tasks, taskId)) v.problem('taskId', `unknown task "${taskId}"`);
  const pending = s['pendingDecisionId'];
  if (typeof pending === 'string') {
    if (!hasKey(decisions, pending)) v.problem('pendingDecisionId', `unknown decision "${pending}"`);
    else if ((decisions as Record<string, Record<string, unknown>>)[pending]?.['status'] !== 'pending') {
      v.problem('pendingDecisionId', 'references a decision that is not pending');
    }
  }

  v.throwIfInvalid('state.json');
  return raw as ProjectState;
}

function validateThreadsDocument(raw: unknown): ThreadsDocument {
  const v = new Validator();
  if (!v.isObject('threads', raw)) v.throwIfInvalid('threads/INDEX.json');
  const d = raw as Record<string, unknown>;
  if (d['schemaVersion'] !== 1) v.problem('schemaVersion', 'expected 1');
  v.integer('revision', d['revision']);
  v.nullableString('activeThreadId', d['activeThreadId']);
  const threads = d['threads'];
  v.record('threads', threads, (key, item, path) => {
    if (!v.isObject(path, item)) return;
    if (item['id'] !== key) v.problem(`${path}.id`, 'must match its key');
    v.nullableString(`${path}.parentId`, item['parentId']);
    v.string(`${path}.topic`, item['topic']);
    v.oneOf(`${path}.status`, item['status'], ['active', 'suspended', 'closed'] as const);
    v.integer(`${path}.pausedWorkflowRevision`, item['pausedWorkflowRevision']);
    v.nullableString(`${path}.pausedTaskId`, item['pausedTaskId']);
    v.nullableString(`${path}.pausedDecisionId`, item['pausedDecisionId']);
    v.oneOf(`${path}.pausedStatus`, item['pausedStatus'], WORKFLOW_STATUSES);
    v.string(`${path}.openedAt`, item['openedAt']);
    v.optionalString(`${path}.closedAt`, item['closedAt']);
    if (v.array(`${path}.entries`, item['entries'])) {
      item['entries'].forEach((e, i) => {
        const p = `${path}.entries[${i}]`;
        if (!v.isObject(p, e)) return;
        v.string(`${p}.ref`, e['ref']);
        v.string(`${p}.summary`, e['summary'], { allowEmpty: true });
        v.string(`${p}.at`, e['at']);
      });
    }
  });
  const active = d['activeThreadId'];
  if (typeof active === 'string') {
    const thread = hasKey(threads, active) ? (threads as Record<string, Record<string, unknown>>)[active] : undefined;
    if (!thread) v.problem('activeThreadId', `unknown thread "${active}"`);
    else if (thread['status'] !== 'active') v.problem('activeThreadId', 'references a thread that is not active');
  }
  v.throwIfInvalid('threads/INDEX.json');
  return raw as ThreadsDocument;
}

function validateLearnerDocument(raw: unknown): LearnerDocument {
  const v = new Validator();
  if (!v.isObject('learner', raw)) v.throwIfInvalid('learner.json');
  const d = raw as Record<string, unknown>;
  if (d['schemaVersion'] !== 1) v.problem('schemaVersion', 'expected 1');
  v.integer('revision', d['revision']);
  v.string('learnerId', d['learnerId']);
  v.oneOf('mode', d['mode'], LEARNING_MODES);
  const ids = new Set<string>();
  if (v.array('evidence', d['evidence'])) {
    d['evidence'].forEach((e, i) => {
      const p = `evidence[${i}]`;
      if (!v.isObject(p, e)) return;
      if (v.string(`${p}.id`, e['id'])) {
        if (ids.has(e['id'])) v.problem(`${p}.id`, 'duplicate evidence id');
        ids.add(e['id']);
      }
      if (v.string(`${p}.competencyId`, e['competencyId']) && !COMPETENCY_IDS.has(e['competencyId'])) {
        v.problem(`${p}.competencyId`, `unknown competency "${e['competencyId']}"`);
      }
      v.oneOf(`${p}.type`, e['type'], EVIDENCE_TYPES);
      if (![0, 1, 2, 3].includes(e['levelCandidate'] as number)) v.problem(`${p}.levelCandidate`, 'expected 0-3');
      v.string(`${p}.sourceRef`, e['sourceRef']);
      v.string(`${p}.assessedAt`, e['assessedAt']);
      v.oneOf(`${p}.assessor`, e['assessor'], ['learner', 'agent', 'human'] as const);
      v.oneOf(`${p}.confidence`, e['confidence'], ['low', 'medium', 'high'] as const);
      if (e['contradicts'] !== undefined) v.boolean(`${p}.contradicts`, e['contradicts']);
    });
  }
  v.throwIfInvalid('learner.json');
  return raw as LearnerDocument;
}

function hasKey(container: unknown, key: string): boolean {
  return typeof container === 'object' && container !== null && Object.hasOwn(container, key);
}

export const projectStateSchema: DocumentSchema<ProjectState> = {
  name: 'state.json',
  currentVersion: 1,
  migrations: {},
  validate: validateProjectState,
};

export const threadsSchema: DocumentSchema<ThreadsDocument> = {
  name: 'threads/INDEX.json',
  currentVersion: 1,
  migrations: {},
  validate: validateThreadsDocument,
};

export const learnerSchema: DocumentSchema<LearnerDocument> = {
  name: 'learner.json',
  currentVersion: 1,
  migrations: {},
  validate: validateLearnerDocument,
};
