export const WORKFLOW_STATUSES = [
  'idle',
  'planning',
  'waiting_for_decision',
  'waiting_for_evidence',
  'ready',
  'executing',
  'verifying',
  'complete',
  'blocked',
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const TASK_STATUSES = ['pending', 'active', 'executing', 'complete', 'blocked'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const CHECKPOINT_TYPES = ['decision_gate', 'understanding_gate', 'learning_opportunity'] as const;
export type CheckpointType = (typeof CHECKPOINT_TYPES)[number];

export const CHECKPOINT_STATUSES = ['pending', 'satisfied', 'deferred'] as const;
export type CheckpointStatus = (typeof CHECKPOINT_STATUSES)[number];

export interface AcceptanceCriterion {
  id: string;
  description: string;
}

export interface CriterionResult {
  criterionId: string;
  outcome: 'pass' | 'fail';
  /** Where the evidence lives, e.g. a test command and its log path. */
  evidenceRef: string;
}

export interface VerificationRecord {
  at: string;
  results: CriterionResult[];
  accepted: boolean;
}

export interface TaskRecord {
  id: string;
  title: string;
  dependencies: string[];
  checkpointIds: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  status: TaskStatus;
  /** Competencies this task gives a chance to teach; see src/learning/catalogue.ts. */
  competencyIds?: string[];
  /** Explicit learner or operator reference that authorised execution. */
  startedBy?: string;
  verifications: VerificationRecord[];
}

export interface DecisionRecord {
  id: string;
  question: string;
  options: string[];
  status: 'pending' | 'resolved';
  taskId?: string;
  selection?: string;
  /** Reference to the explicit learner input that made the choice. */
  evidenceRef?: string;
  resolvedAt?: string;
}

export interface CheckpointRecord {
  id: string;
  type: CheckpointType;
  /** decision_gate checkpoints are always blocking. */
  blocking: boolean;
  status: CheckpointStatus;
  decisionId?: string;
  evidenceRef?: string;
  deferredReason?: string;
}

export interface ProjectState {
  schemaVersion: 1;
  revision: number;
  projectId: string;
  phaseId: string | null;
  taskId: string | null;
  status: WorkflowStatus;
  pendingDecisionId: string | null;
  tasks: Record<string, TaskRecord>;
  decisions: Record<string, DecisionRecord>;
  checkpoints: Record<string, CheckpointRecord>;
}

export type ThreadStatus = 'active' | 'suspended' | 'closed';

export interface ThreadEntry {
  ref: string;
  /** Short learner-supplied summary; full transcripts are not stored. */
  summary: string;
  at: string;
}

export interface LearningThread {
  id: string;
  parentId: string | null;
  topic: string;
  status: ThreadStatus;
  pausedWorkflowRevision: number;
  pausedTaskId: string | null;
  pausedDecisionId: string | null;
  pausedStatus: WorkflowStatus;
  entries: ThreadEntry[];
  openedAt: string;
  closedAt?: string;
}

export interface ThreadsDocument {
  schemaVersion: 1;
  revision: number;
  activeThreadId: string | null;
  threads: Record<string, LearningThread>;
}

export interface WorkflowEvent {
  type: string;
  at: string;
  details: Record<string, unknown>;
}

export interface TransitionResult<T> {
  state: T;
  events: WorkflowEvent[];
}
